import { describe, expect, it } from "vitest";

import {
  choosePort,
  databaseUrlFor,
  parseEnvPort,
  planPrune,
  renderEnvLocal,
  worktreeDatabaseName,
} from "./worktree-db";

describe("worktreeDatabaseName", () => {
  it("names the database after the worktree directory", () => {
    expect(
      worktreeDatabaseName(
        "/home/poto/.t3/worktrees/en-escena/t3code-c2b191df",
      ),
    ).toBe("en-escena-wt-t3code-c2b191df");
  });

  it("folds characters Postgres would need quoting for", () => {
    expect(worktreeDatabaseName("/tmp/Fix_Seed.Race")).toBe(
      "en-escena-wt-fix-seed-race",
    );
  });

  it("stays inside Postgres's 63-byte identifier limit", () => {
    expect(worktreeDatabaseName(`/tmp/${"a".repeat(80)}`)).toHaveLength(63);
  });
});

describe("databaseUrlFor", () => {
  it("keeps the base URL's server and swaps only the database", () => {
    expect(
      databaseUrlFor(
        "postgres://postgres:postgres@localhost:5433/en-escena",
        "en-escena-wt-x",
      ),
    ).toBe("postgres://postgres:postgres@localhost:5433/en-escena-wt-x");
  });
});

describe("choosePort", () => {
  it("is stable for the same worktree", () => {
    const first = choosePort("en-escena-wt-a", new Set());

    expect(choosePort("en-escena-wt-a", new Set())).toBe(first);
    expect(first).toBeGreaterThanOrEqual(5200);
    expect(first).toBeLessThan(6000);
  });

  it("steps past a port another worktree already claims", () => {
    const taken = choosePort("en-escena-wt-a", new Set());

    expect(choosePort("en-escena-wt-a", new Set([taken]))).toBe(
      taken === 5999 ? 5200 : taken + 1,
    );
  });
});

describe("renderEnvLocal / parseEnvPort", () => {
  it("writes a file whose port reads back", () => {
    const content = renderEnvLocal({
      databaseUrl: "postgres://postgres:postgres@localhost:5433/en-escena-wt-x",
      port: 5321,
    });

    expect(content).toContain(
      'DATABASE_URL="postgres://postgres:postgres@localhost:5433/en-escena-wt-x"',
    );
    expect(content).toContain('APP_URL="http://localhost:5321"');
    expect(content).toContain('BETTER_AUTH_URL="http://localhost:5321"');
    expect(parseEnvPort(content)).toBe(5321);
  });

  it("reads no port from a file without one", () => {
    expect(parseEnvPort('DATABASE_URL="x"\n')).toBeUndefined();
  });
});

describe("planPrune", () => {
  it("drops only worktree databases whose worktree is gone", () => {
    expect(
      planPrune({
        databases: [
          "en-escena",
          "en-escena-test",
          "postgres",
          "en-escena-wt-live",
          "en-escena-wt-gone",
        ],
        worktreePaths: ["/home/poto/projects/en-escena", "/wt/live"],
      }),
    ).toEqual(["en-escena-wt-gone"]);
  });
});

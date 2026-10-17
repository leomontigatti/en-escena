import { describe, expect, it } from "vitest";

import { databaseName, renderInfo } from "./dev-info";

describe("databaseName", () => {
  it("keeps only the database name, never the credentials", () => {
    expect(
      databaseName("postgres://postgres:s3cret@localhost:5432/en-escena-wt-x"),
    ).toBe("en-escena-wt-x");
  });

  it("is null when the URL is missing or has no database", () => {
    expect(databaseName(undefined)).toBeNull();
    expect(databaseName("postgres://localhost:5432")).toBeNull();
    expect(databaseName("not a url")).toBeNull();
  });
});

describe("renderInfo", () => {
  const base = {
    root: "/wt",
    branch: "feat/x",
    setup: [{ name: ".env.local", ok: false, detail: "not yet" }],
    port: 5301,
    storage: "/data/en-escena/worktrees/en-escena-wt-x",
    tools: [{ name: "codex", ok: true, detail: "Logged in" }],
  };

  it("prints the query and psql lines and the table prefix for the database", () => {
    const output = renderInfo({ ...base, database: "en-escena-wt-x" });

    expect(output).toContain('pnpm db:sql "select …"');
    expect(output).toContain(
      "docker exec -it en-escena-postgres psql -U postgres -d en-escena-wt-x",
    );
    expect(output).toContain("en_escena_");
    expect(output).toContain("Dev port: 5301");
    expect(output).toContain(
      "Storage:  /data/en-escena/worktrees/en-escena-wt-x",
    );
    expect(output).toContain("MISSING .env.local: not yet");
    expect(output).toContain("ok      codex: Logged in");
  });

  it("drops the query and psql lines when there is no database", () => {
    const output = renderInfo({ ...base, database: null });

    expect(output).not.toContain("psql");
    expect(output).not.toContain("db:sql");
  });

  it("says when no storage folder is set", () => {
    expect(renderInfo({ ...base, database: null, storage: null })).toContain(
      "Storage:  none: STORAGE_VOLUME_DIR is not set",
    );
  });
});

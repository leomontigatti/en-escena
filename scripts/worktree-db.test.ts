import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  copyUploads,
  choosePort,
  databaseUrlFor,
  isWithin,
  parseEnvPort,
  planPrune,
  renderEnvLocal,
  withStorageDir,
  worktreeDatabaseName,
  worktreeStorageDir,
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
      storageDir: "/home/u/.local/share/en-escena/worktrees/en-escena-wt-x",
    });

    expect(content).toContain(
      'DATABASE_URL="postgres://postgres:postgres@localhost:5433/en-escena-wt-x"',
    );
    expect(content).toContain('APP_URL="http://localhost:5321"');
    expect(content).toContain('BETTER_AUTH_URL="http://localhost:5321"');
    // A fresh file already names its folder, so `ensure` adds no second line.
    expect(withStorageDir(content, "/elsewhere")).toBeUndefined();
    expect(parseEnvPort(content)).toBe(5321);
  });

  it("reads no port from a file without one", () => {
    expect(parseEnvPort('DATABASE_URL="x"\n')).toBeUndefined();
  });
});

describe("worktreeStorageDir", () => {
  it("keeps a worktree's files in the data home, named like its database", () => {
    expect(worktreeStorageDir("en-escena-wt-x", { HOME: "/home/u" })).toBe(
      "/home/u/.local/share/en-escena/worktrees/en-escena-wt-x",
    );
  });

  it("follows XDG_DATA_HOME when it is set", () => {
    expect(
      worktreeStorageDir("en-escena-wt-x", {
        HOME: "/home/u",
        XDG_DATA_HOME: "/data",
      }),
    ).toBe("/data/en-escena/worktrees/en-escena-wt-x");
  });

  it("ignores a relative XDG_DATA_HOME, which would land in the checkout", () => {
    expect(
      worktreeStorageDir("en-escena-wt-x", {
        HOME: "/home/u",
        XDG_DATA_HOME: "data",
      }),
    ).toBe("/home/u/.local/share/en-escena/worktrees/en-escena-wt-x");
  });
});

describe("isWithin", () => {
  // `ensure` copies the old shared folder into the worktree's; Node refuses
  // to copy a folder onto itself or into its own subfolder.
  it("is true for the folder itself and anything under it", () => {
    expect(isWithin("/s", "/s")).toBe(true);
    expect(isWithin("/s/worktrees/x", "/s")).toBe(true);
  });

  it("is false for a sibling whose name only starts the same", () => {
    expect(isWithin("/s-other/x", "/s")).toBe(false);
    expect(isWithin("/data/worktrees/x", "/data/storage")).toBe(false);
  });
});

describe("copyUploads", () => {
  let scratch: string;

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  function folders() {
    scratch = mkdtempSync(path.join(tmpdir(), "copy-uploads-"));
    const from = path.join(scratch, "shared", "music");
    const to = path.join(scratch, "worktree");
    mkdirSync(from, { recursive: true });
    writeFileSync(path.join(from, "song.mp3"), "the whole song");
    return { from: path.join(scratch, "shared"), to };
  }

  it("repairs a file an interrupted copy left half-written", () => {
    const { from, to } = folders();
    mkdirSync(path.join(to, "music"), { recursive: true });
    writeFileSync(path.join(to, "music", "song.mp3"), "the wh");

    copyUploads(from, to);

    expect(readFileSync(path.join(to, "music", "song.mp3"), "utf8")).toBe(
      "the whole song",
    );
  });

  it("copies what a link points at rather than skipping it", () => {
    const { from, to } = folders();
    symlinkSync(
      path.join(from, "music", "song.mp3"),
      path.join(from, "music", "linked.mp3"),
    );

    copyUploads(from, to);

    expect(readFileSync(path.join(to, "music", "linked.mp3"), "utf8")).toBe(
      "the whole song",
    );
  });

  it("fails on a named pipe, naming it, rather than waiting on it forever", () => {
    const { from, to } = folders();
    execFileSync("mkfifo", [path.join(from, "music", "pipe")]);

    expect(() => copyUploads(from, to)).toThrow(
      /pipe[\s\S]*STORAGE_VOLUME_DIR/,
    );
  });

  it.skipIf(process.getuid?.() === 0)(
    "names the file it cannot copy and the way out",
    () => {
      const { from, to } = folders();
      chmodSync(path.join(from, "music", "song.mp3"), 0o000);

      expect(() => copyUploads(from, to)).toThrow(
        /song\.mp3[\s\S]*STORAGE_VOLUME_DIR/,
      );
    },
  );
});

describe("withStorageDir", () => {
  const older = [
    "# Written by `pnpm db:worktree`",
    'DATABASE_URL="postgres://localhost:5433/en-escena-wt-x"',
    'PORT="5321"',
    "",
  ].join("\n");

  it("adds the storage line to a .env.local written before it existed", () => {
    const upgraded = withStorageDir(older, "/s/en-escena-wt-x");

    expect(upgraded).toBe(`${older}STORAGE_VOLUME_DIR="/s/en-escena-wt-x"\n`);
    expect(parseEnvPort(upgraded ?? "")).toBe(5321);
  });

  it("adds the line on its own line when the file lacks a final newline", () => {
    expect(withStorageDir('PORT="5321"', "/s/x")).toBe(
      'PORT="5321"\nSTORAGE_VOLUME_DIR="/s/x"\n',
    );
  });

  it("leaves a file that already sets one untouched", () => {
    const current = `${older}STORAGE_VOLUME_DIR="/elsewhere"\n`;

    expect(withStorageDir(current, "/s/en-escena-wt-x")).toBeUndefined();
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
        storageDirs: [],
        worktreePaths: ["/home/poto/projects/en-escena", "/wt/live"],
      }),
    ).toEqual(["en-escena-wt-gone"]);
  });

  it("also lists the storage folder of a gone worktree whose database is already dropped", () => {
    expect(
      planPrune({
        databases: ["en-escena", "en-escena-wt-live", "en-escena-wt-gone"],
        storageDirs: [
          "en-escena-wt-live",
          "en-escena-wt-gone",
          "en-escena-wt-files-only",
        ],
        worktreePaths: ["/wt/live"],
      }),
    ).toEqual(["en-escena-wt-gone", "en-escena-wt-files-only"]);
  });

  it("drops, when applying, only the databases the accepted dry run listed", () => {
    expect(
      planPrune({
        databases: ["en-escena-wt-listed", "en-escena-wt-orphaned-since"],
        storageDirs: [],
        worktreePaths: [],
        accepted: new Set(["en-escena-wt-listed"]),
      }),
    ).toEqual(["en-escena-wt-listed"]);
  });
});

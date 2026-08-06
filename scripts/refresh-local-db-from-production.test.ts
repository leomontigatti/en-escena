import { describe, expect, test } from "vitest";

import {
  assertCustomFormat,
  newestArtifactCommand,
} from "./refresh-local-db-from-production.mjs";

describe("artifact format guard", () => {
  test("accepts a custom-format Coolify artifact", () => {
    const path =
      "/data/coolify/backups/databases/root-team-0/postgresql-database-abc/pg-dump-enescena-20260805.dmp";

    expect(assertCustomFormat(path)).toBe(path);
  });

  test("refuses the gzipped pg_dumpall artifacts that predate #594", () => {
    expect(() =>
      assertCustomFormat("/data/coolify/backups/pg-dump-all-20260101.gz"),
    ).toThrow(/Not a custom-format artifact/);
  });

  test("refuses a path that only mentions .dmp somewhere in the middle", () => {
    expect(() =>
      assertCustomFormat("/backups/pg-dump-enescena.dmp.gz"),
    ).toThrow(/Not a custom-format artifact/);
  });
});

describe("newest artifact lookup", () => {
  const command = newestArtifactCommand("/data/coolify/backups/databases");

  test("looks only for custom-format artifacts", () => {
    expect(command).toContain("-name 'pg-dump-*.dmp'");
    expect(command).not.toContain(".gz");
  });

  test("sorts by mtime and takes a single path", () => {
    expect(command).toContain("sort -rn");
    expect(command).toContain("head -1");
  });

  test("keeps paths containing spaces intact", () => {
    // `cut -f2-` (not `-f2`) is what makes this true; `-f2` would truncate at
    // the first space in the filename.
    expect(command).toContain("cut -d' ' -f2-");
  });

  test("quotes the search directory", () => {
    expect(newestArtifactCommand("/tmp/some dir")).toContain("'/tmp/some dir'");
  });
});

import { describe, expect, test } from "vitest";

import {
  artifactOnDateCommand,
  assertCustomFormat,
  assertIsoDate,
  availableDatesCommand,
  newestArtifactCommand,
  remoteScpSource,
} from "./refresh-local-db-from-production.mjs";

describe("scp source argument", () => {
  const path =
    "/data/coolify/backups/databases/root-team-0/postgresql-database-abc/pg-dump-enescena-1785985203.dmp";

  test("does not quote the remote path", () => {
    // scp has spoken SFTP by default since OpenSSH 9.0, so no remote shell
    // strips quotes: any added land in the filename and the fetch fails with
    // "No such file or directory". Observed against rylai on OpenSSH 9.6.
    expect(remoteScpSource("rylai", path)).toBe(`rylai:${path}`);
    expect(remoteScpSource("rylai", path)).not.toContain("'");
  });

  test("passes a spaced path through untouched", () => {
    expect(remoteScpSource("rylai", "/backups/db one.dmp")).toBe(
      "rylai:/backups/db one.dmp",
    );
  });

  test("carries a user@host source unchanged", () => {
    expect(remoteScpSource("root@72.60.59.2", path)).toBe(
      `root@72.60.59.2:${path}`,
    );
  });
});

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

describe("artifact for a given day", () => {
  const command = artifactOnDateCommand(
    "/data/coolify/backups/databases",
    "2026-09-12",
  );

  test("bounds the search to that single day", () => {
    // Half-open: written on the 12th, not on the 13th. `find` hands both
    // strings to GNU date, so the month and year ends need no arithmetic here.
    expect(command).toContain("-newermt '2026-09-12'");
    expect(command).toContain("! -newermt '2026-09-12 + 1 day'");
  });

  test("takes the newest of that day", () => {
    expect(command).toContain("sort -rn");
    expect(command).toContain("head -1");
  });

  test("looks only for custom-format artifacts", () => {
    expect(command).toContain("-name 'pg-dump-*.dmp'");
  });
});

describe("available dates", () => {
  const command = availableDatesCommand("/data/coolify/backups/databases");

  test("reports one line per day, newest first", () => {
    expect(command).toContain("-printf '%TY-%Tm-%Td\\n'");
    expect(command).toContain("sort -ru");
  });
});

describe("BACKUP_ON validation", () => {
  test("accepts a calendar date", () => {
    expect(assertIsoDate("2026-09-12")).toBe("2026-09-12");
  });

  test.each(["12-09-2026", "yesterday", "2026-9-1", ""])(
    "refuses %j",
    (value) => {
      expect(() => assertIsoDate(value)).toThrow(/YYYY-MM-DD/);
    },
  );

  test("refuses a value that would break out of the remote quoting", () => {
    // It lands inside single quotes in an ssh command line; a quote of its own
    // would end the argument and run the rest as a separate command.
    expect(() => assertIsoDate("2026-09-12'; rm -rf /tmp/x; '")).toThrow(
      /YYYY-MM-DD/,
    );
  });
});

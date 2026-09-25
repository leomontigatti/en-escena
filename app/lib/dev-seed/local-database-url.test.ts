import { describe, expect, test } from "vitest";

import { assertLocalDatabaseUrl } from "@/lib/dev-seed/local-database-url";

describe("assertLocalDatabaseUrl", () => {
  test.each([
    "postgres://postgres:postgres@localhost:5433/en-escena",
    "postgresql://postgres@127.0.0.1/en-escena",
  ])("accepts a database on this machine: %s", (databaseUrl) => {
    expect(() => assertLocalDatabaseUrl(databaseUrl)).not.toThrow();
  });

  test.each([
    "postgres://postgres:secret@db.example.com:5432/en-escena",
    "postgres://postgres@localhost.example.com/en-escena",
    "postgres://postgres@10.0.0.5/en-escena",
  ])("refuses any other host: %s", (databaseUrl) => {
    expect(() => assertLocalDatabaseUrl(databaseUrl)).toThrow(/Refusing/);
  });

  test("refuses a missing or unparseable URL", () => {
    expect(() => assertLocalDatabaseUrl(undefined)).toThrow(/required/);
    expect(() => assertLocalDatabaseUrl("not a url")).toThrow(/valid/);
  });
});

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  readOnlyQuery,
  renderTable,
  resolveTarget,
  type Session,
} from "./db-sql";

describe("resolveTarget", () => {
  const env = {
    DATABASE_URL: "postgres://postgres:s3cret@localhost:5433/en-escena-wt-x",
    TEST_DATABASE_URL: "postgres://postgres:s3cret@localhost:5433/custom-test",
  };

  it("targets the worktree's own database once .env.local set it up", () => {
    expect(
      resolveTarget({
        env,
        test: false,
        mainCheckout: false,
        hasEnvLocal: true,
      }),
    ).toEqual({ url: env.DATABASE_URL, database: "en-escena-wt-x" });
  });

  it("targets DATABASE_URL in the main checkout", () => {
    expect(
      resolveTarget({
        env: { DATABASE_URL: "postgres://localhost:5433/en-escena" },
        test: false,
        mainCheckout: true,
        hasEnvLocal: false,
      }).database,
    ).toBe("en-escena");
  });

  it("refuses a worktree with no database of its own rather than reading the main checkout's", () => {
    expect(() =>
      resolveTarget({
        env,
        test: false,
        mainCheckout: false,
        hasEnvLocal: false,
      }),
    ).toThrow(/pnpm db:worktree/);
  });

  it("targets TEST_DATABASE_URL with --test, in any checkout", () => {
    expect(
      resolveTarget({
        env,
        test: true,
        mainCheckout: false,
        hasEnvLocal: false,
      }),
    ).toEqual({ url: env.TEST_DATABASE_URL, database: "custom-test" });
  });

  it("falls back to the default test database when TEST_DATABASE_URL is unset", () => {
    expect(
      resolveTarget({
        env: {},
        test: true,
        mainCheckout: true,
        hasEnvLocal: false,
      }).database,
    ).toBe("en-escena-test");
  });

  it("fails when DATABASE_URL is missing", () => {
    expect(() =>
      resolveTarget({
        env: {},
        test: false,
        mainCheckout: true,
        hasEnvLocal: false,
      }),
    ).toThrow(/DATABASE_URL/);
  });
});

describe("readOnlyQuery", () => {
  let client: PGlite;
  let session: Session;

  beforeAll(async () => {
    client = new PGlite();
    await client.exec(
      "create table en_escena_note (id int primary key, body text); insert into en_escena_note values (1, 'hola'), (2, null);",
    );
    session = {
      query: async (text) => {
        const result = await client.query<unknown[]>(text, [], {
          rowMode: "array",
        });
        return {
          columns: result.fields.map((field) => field.name),
          rows: result.rows,
        };
      },
    };
  });

  afterAll(async () => {
    await client.close();
  });

  it("returns the columns and rows of a read", async () => {
    await expect(
      readOnlyQuery(session, "select id, body from en_escena_note order by id"),
    ).resolves.toEqual({
      columns: ["id", "body"],
      rows: [
        [1, "hola"],
        [2, null],
      ],
    });
  });

  it.each([
    "insert into en_escena_note values (3, 'x')",
    "update en_escena_note set body = 'x'",
    "delete from en_escena_note",
    "create table en_escena_other (id int)",
  ])("rejects the write %s", async (text) => {
    await expect(readOnlyQuery(session, text)).rejects.toThrow(/read-only/);
  });

  it("rejects a write that first switches the transaction back to read-write", async () => {
    await expect(
      readOnlyQuery(
        session,
        "with off as (select set_config('transaction_read_only', 'off', true)) insert into en_escena_note select 4, 'x' from off",
      ),
    ).rejects.toThrow();
  });

  it("leaves the data as it was", async () => {
    const { rows } = await readOnlyQuery(
      session,
      "select count(*)::int from en_escena_note",
    );

    expect(rows).toEqual([[2]]);
  });
});

describe("renderTable", () => {
  it("aligns the columns under their headers and counts the rows", () => {
    expect(
      renderTable({
        columns: ["id", "name"],
        rows: [
          [1, "Academia Demo"],
          [22, null],
        ],
        cap: 50,
      }),
    ).toBe(
      [
        "id | name",
        "---+--------------",
        "1  | Academia Demo",
        "22 | NULL",
        "(2 rows)",
      ].join("\n"),
    );
  });

  it("prints only the first rows past the cap and says how many it left out", () => {
    const output = renderTable({
      columns: ["n"],
      rows: [[1], [2], [3], [4], [5]],
      cap: 2,
    });

    expect(output.split("\n")).toEqual([
      "n",
      "-",
      "1",
      "2",
      "… 3 more rows (5 in total): narrow the query or page it with LIMIT/OFFSET",
    ]);
  });

  it("writes dates, objects and line breaks on one line", () => {
    const output = renderTable({
      columns: ["at", "data", "text"],
      rows: [[new Date("2026-10-11T12:00:00.000Z"), { a: 1 }, "two\nlines"]],
      cap: 50,
    });

    expect(output).toContain(
      '2026-10-11T12:00:00.000Z | {"a":1} | two\\nlines',
    );
  });

  it("says when a statement returns no result set", () => {
    expect(renderTable({ columns: [], rows: [], cap: 50 })).toBe(
      "(no result set)",
    );
  });

  it("says when a statement returns no rows", () => {
    expect(renderTable({ columns: ["id"], rows: [], cap: 50 })).toBe(
      "id\n--\n(0 rows)",
    );
  });
});

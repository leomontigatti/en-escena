import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

import { getTestDatabaseUrl } from "../tests/db/config";
import { databaseName } from "./dev-info";
import { git } from "./worktree-db";

// Runs one read-only query against this worktree's development database, or
// the test database with `--test`, and prints it as an aligned table, so an
// agent stops hand-writing `docker exec … psql` against the wrong container or
// the wrong worktree's database.
//
// Usage: pnpm db:sql "<query>" [--test]
//
// The database is the one the other `db:*` scripts use: `DATABASE_URL` as
// `.env` and the worktree's `.env.local` leave it. A worktree with no
// `.env.local` would get the main checkout's database from `.env`, so it is
// refused instead. The session opens read-only and the query runs inside a
// read-only transaction that is always rolled back, so a write fails in
// Postgres itself.

const ROW_CAP = 50;

export type Target = { url: string; database: string };
export type Result = { columns: string[]; rows: unknown[][] };
export type Session = { query(text: string): Promise<Result> };

export function resolveTarget(input: {
  env: NodeJS.ProcessEnv;
  test: boolean;
  mainCheckout: boolean;
  hasEnvLocal: boolean;
}): Target {
  const url = input.test
    ? (input.env.TEST_DATABASE_URL ?? getTestDatabaseUrl())
    : input.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not set; is .env linked?");
  }
  if (!input.test && !input.mainCheckout && !input.hasEnvLocal) {
    throw new Error(
      "This worktree has no database of its own yet, and .env alone points at the main checkout's. Run `pnpm db:worktree` first.",
    );
  }

  const database = databaseName(url);

  if (!database) {
    throw new Error("The database URL names no database.");
  }

  return { url, database };
}

export async function readOnlyQuery(
  session: Session,
  text: string,
): Promise<Result> {
  await session.query("begin transaction read only");

  try {
    return await session.query(text);
  } finally {
    await session.query("rollback");
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `\\x${value.toString("hex")}`;

  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  return text.replaceAll("\r", "\\r").replaceAll("\n", "\\n");
}

export function renderTable(input: Result & { cap: number }): string {
  if (input.columns.length === 0) return "(no result set)";

  const shown = input.rows
    .slice(0, input.cap)
    .map((row) => row.map(formatValue));
  const widths = input.columns.map((column, index) =>
    Math.max(column.length, ...shown.map((row) => row[index]?.length ?? 0)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? 0))
      .join(" | ")
      .trimEnd();
  const hidden = input.rows.length - shown.length;

  return [
    line(input.columns),
    widths.map((width) => "-".repeat(width)).join("-+-"),
    ...shown.map(line),
    hidden > 0
      ? `… ${hidden} more rows (${input.rows.length} in total): narrow the query or page it with LIMIT/OFFSET`
      : `(${input.rows.length} ${input.rows.length === 1 ? "row" : "rows"})`,
  ].join("\n");
}

async function main(args: string[]) {
  const test = args.includes("--test");
  const queries = args.filter((arg) => arg !== "--test" && arg !== "--");

  if (queries.length !== 1 || !queries[0]?.trim()) {
    throw new Error('usage: pnpm db:sql "<query>" [--test]');
  }

  const root = git(["rev-parse", "--show-toplevel"]);
  const target = resolveTarget({
    env: process.env,
    test,
    mainCheckout:
      path.resolve(root, git(["rev-parse", "--git-dir"])) ===
      path.resolve(root, git(["rev-parse", "--git-common-dir"])),
    hasEnvLocal: existsSync(path.join(root, ".env.local")),
  });
  const sql = postgres(target.url, {
    max: 1,
    onnotice: () => {},
    connection: {
      application_name: "pnpm db:sql",
      default_transaction_read_only: true,
    },
  });

  // Without parameters postgres.js sends a query over the simple protocol,
  // which runs several `;`-separated statements, so `commit; delete …` would
  // leave the read-only transaction. The extended protocol takes exactly one.
  // `simple` is missing from the published option types.
  const extendedProtocol = { prepare: false, simple: false };

  try {
    const connection = await sql.reserve();

    try {
      const result = await readOnlyQuery(
        {
          query: async (text) => {
            const rows = await connection
              .unsafe(text, [], extendedProtocol)
              .values();
            return {
              columns: rows.columns?.map((column) => column.name) ?? [],
              rows,
            };
          },
        },
        queries[0],
      );

      console.error(`Database: ${target.database}`);
      console.log(renderTable({ ...result, cap: ROW_CAP }));
    } finally {
      connection.release();
    }
  } finally {
    await sql.end();
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      /ECONNREFUSED/.test(message)
        ? `${message}\nIs Postgres up? docker compose up -d --wait postgres`
        : /^relation ".*" does not exist$/.test(message)
          ? `${message}\nTables are prefixed en_escena_ (en_escena_user); \`select tablename from pg_tables where schemaname = 'public'\` lists them.`
          : message,
    );
    process.exitCode = 1;
  });
}

import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import {
  findJournalInconsistencies,
  readHashedJournalEntries,
} from "./migrations/journal.mjs";

/**
 * Applies pending migrations, then exits. Run by the container entrypoint
 * before the app serves, because the production Postgres is not reachable from
 * outside the VPS and `pnpm db:migrate` has no route to it.
 *
 * Written in plain `.mjs` on purpose: `tsx` and `drizzle-kit` are
 * devDependencies and are stripped from the runtime image by `pnpm prune`,
 * while `drizzle-orm` and `postgres` are production dependencies.
 *
 * See docs/db/migrations.md.
 */

// Resolved relative to this file so the same expression works in the repo and
// in the image, where `app/db/migrations` is copied to the identical path.
const migrationsFolder = fileURLToPath(
  new URL("../app/db/migrations", import.meta.url),
);

const migrationLockName = "enescena-migrations";
const connectRetryBudgetMs = 45_000;
const initialRetryDelayMs = 500;
const maxRetryDelayMs = 5_000;
const lockTimeoutMs = 60_000;

// The app and Postgres are co-located containers with no start ordering, so a
// refused connection right after a host reboot is expected rather than
// exceptional. Anything outside this set — bad credentials, missing database,
// failing DDL — is deterministic and must not be retried.
const transientConnectionCodes = new Set([
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "CONNECTION_ENDED",
  "CONNECTION_REFUSED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "08000",
  "08003",
  "08006",
  "57P01",
  "57P02",
  "57P03",
]);

/** @param {unknown} error */
function isTransientConnectionError(error) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = /** @type {{ code?: unknown }} */ (error).code;

  return typeof code === "string" && transientConnectionCodes.has(code);
}

/** @param {number} milliseconds */
function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Retries only until the database answers. Once it has, every later failure is
 * treated as fatal, which keeps the two error classes cleanly separated: a
 * database that is still booting is waited out, a migration that cannot apply
 * stops the container.
 *
 * @param {ReturnType<typeof postgres>} sql
 */
async function waitForDatabase(sql) {
  const deadline = Date.now() + connectRetryBudgetMs;
  let delay = initialRetryDelayMs;

  for (;;) {
    try {
      await sql`select 1`;
      return;
    } catch (error) {
      if (!isTransientConnectionError(error) || Date.now() >= deadline) {
        throw error;
      }

      console.log(
        `[migrate] database not reachable yet, retrying in ${delay}ms.`,
      );
      await wait(delay);
      delay = Math.min(delay * 2, maxRetryDelayMs);
    }
  }
}

/**
 * Blocking, not `pg_try_advisory_lock`: a second starter should wait and then
 * correctly no-op, not fail to boot. Consequence 3 in scripts/migrations/journal.mjs
 * is what makes the lock necessary — without it two overlapping container starts
 * act on the same stale watermark and the second re-runs committed DDL.
 *
 * The timeout bounds the wait for the lock only. It is restored afterwards
 * rather than zeroed, so whatever `statement_timeout` the role carries still
 * governs the migrations themselves.
 *
 * @param {ReturnType<typeof postgres>} sql
 */
async function acquireMigrationLock(sql) {
  const [previous] = await sql`
    select current_setting('statement_timeout') as statement_timeout
  `;
  const previousStatementTimeout = String(previous?.statement_timeout ?? "0");

  await sql`select set_config('statement_timeout', ${String(lockTimeoutMs)}, false)`;

  try {
    await sql`select pg_advisory_lock(hashtext(${migrationLockName}))`;
  } finally {
    await sql`select set_config('statement_timeout', ${previousStatementTimeout}, false)`;
  }
}

/** @param {ReturnType<typeof postgres>} sql */
async function releaseMigrationLock(sql) {
  await sql`select pg_advisory_unlock(hashtext(${migrationLockName}))`;
}

/** @param {ReturnType<typeof postgres>} sql */
async function assertJournalIsConsistent(sql) {
  const appliedRows = await sql`
    select hash, created_at
    from drizzle.__drizzle_migrations
  `.catch((/** @type {unknown} */ error) => {
    // A database that Drizzle has never touched has no journal table yet. That
    // is a fresh install, not an inconsistency.
    if (
      typeof error === "object" &&
      error !== null &&
      /** @type {{ code?: unknown }} */ (error).code === "42P01"
    ) {
      return [];
    }

    throw error;
  });

  const inconsistencies = findJournalInconsistencies({
    entries: readHashedJournalEntries(migrationsFolder),
    appliedMigrations: appliedRows.map((row) => ({
      hash: String(row.hash),
      createdAt: Number(row.created_at),
    })),
  });

  if (inconsistencies.length === 0) {
    return;
  }

  for (const inconsistency of inconsistencies) {
    const explanation =
      inconsistency.reason === "not-applied"
        ? "is older than the applied watermark but was never applied, so Drizzle will skip it forever"
        : "was applied with a different hash, so its .sql file changed after being applied";

    console.error(`[migrate] ${inconsistency.tag} ${explanation}.`);
  }

  throw new Error(
    "Migration journal is inconsistent with drizzle.__drizzle_migrations.",
  );
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("[migrate] DATABASE_URL is required.");
    process.exit(1);
  }

  // `max: 1` is load-bearing: the advisory lock is session-scoped, so the lock
  // and the migrations it guards have to run on the same connection.
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    onnotice: () => {},
  });

  try {
    await waitForDatabase(sql);
    await acquireMigrationLock(sql);

    try {
      await assertJournalIsConsistent(sql);
      await migrate(drizzle(sql), { migrationsFolder });
      console.log("[migrate] migrations up to date.");
    } finally {
      await releaseMigrationLock(sql);
    }
  } finally {
    await sql.end();
  }
}

try {
  await main();
} catch (error) {
  console.error("[migrate] failed, refusing to start the application.");
  console.error(error);
  process.exit(1);
}

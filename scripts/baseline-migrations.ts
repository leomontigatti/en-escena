import { fileURLToPath } from "node:url";

import postgres from "postgres";

import { readHashedJournalEntries } from "./migrations/journal.mjs";

// Registers the baseline migration (idx=0) as already applied in
// `drizzle.__drizzle_migrations` WITHOUT running its DDL. Used once against a
// database whose schema already exists (real production, or a clone of it), so
// that `drizzle-kit migrate` treats it as applied and only runs the migrations
// after it. Metadata-only and reversible: dropping the `drizzle` schema undoes
// it. See docs/db/migrations.md.
const migrationsDirectory = fileURLToPath(
  new URL("../app/db/migrations", import.meta.url),
);

// The (hash, created_at) pair written here has to be exactly the one
// drizzle-orm computes, or `migrate()` re-runs the DDL — hence reading it from
// the shared journal module rather than recomputing it. The invariant is
// guarded by app/db/migrations.db.test.ts.
const [baseline] = readHashedJournalEntries(migrationsDirectory);

if (!baseline || baseline.idx !== 0) {
  console.error("No baseline (idx=0) entry found in meta/_journal.json.");
  process.exit(1);
}

const hash = baseline.hash;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  await sql`create schema if not exists drizzle`;
  await sql`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `;

  const existing = await sql`
    select id from drizzle.__drizzle_migrations
    where hash = ${hash} and created_at = ${baseline.when}
  `;

  if (existing.length > 0) {
    console.log("Baseline migration already registered — nothing to do.");
  } else {
    await sql`
      insert into drizzle.__drizzle_migrations (hash, created_at)
      values (${hash}, ${baseline.when})
    `;
    console.log(
      `Registered baseline migration ${baseline.tag} (hash=${hash.slice(0, 12)}…, when=${baseline.when}).`,
    );
  }
} finally {
  await sql.end();
}

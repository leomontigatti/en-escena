import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

// Registra la migración baseline (idx=0) como ya aplicada en
// `drizzle.__drizzle_migrations` SIN correr su DDL. Se usa una única vez sobre
// una base cuyo schema ya existe (prod real, o un clon de prod), para que
// `drizzle-kit migrate` la trate como aplicada y solo corra las migraciones
// posteriores. Es metadata-only y reversible: dropear el schema `drizzle` lo
// deshace. Ver docs/db/migrations.md.
const migrationsDirectory = fileURLToPath(
  new URL("../app/db/migrations", import.meta.url),
);

const journalPath = fileURLToPath(
  new URL("../app/db/migrations/meta/_journal.json", import.meta.url),
);
const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
  entries: Array<{ idx: number; tag: string; when: number }>;
};
const baseline = journal.entries[0];

if (!baseline || baseline.idx !== 0) {
  console.error("No baseline (idx=0) entry found in meta/_journal.json.");
  process.exit(1);
}

const baselineSqlPath = `${migrationsDirectory}/${baseline.tag}.sql`;
const baselineSql = readFileSync(baselineSqlPath, "utf8");

// El hash debe ser sha256 del contenido crudo del .sql y `created_at` debe ser
// exactamente `when` del journal: así es como el migrator de drizzle-orm
// identifica una migración como aplicada. Cualquier divergencia haría que
// `migrate()` re-ejecute el DDL. El test app/db/migrations.db.test.ts guarda
// esta invariante.
const hash = createHash("sha256").update(baselineSql).digest("hex");

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

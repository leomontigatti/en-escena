import { spawnSync } from "node:child_process";

import postgres from "postgres";

import { getTestDatabaseUrl } from "./config";

const testDatabaseLockKey = "en-escena-test-database";

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function ensureDatabaseExists(databaseUrl: string) {
  const parsedUrl = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));

  if (!databaseName) {
    throw new Error("TEST_DATABASE_URL must include a database name.");
  }

  parsedUrl.pathname = "/postgres";

  const adminClient = postgres(parsedUrl.toString(), { max: 1 });

  try {
    const existingDatabase = await adminClient`
      select 1 from pg_database where datname = ${databaseName}
    `;

    if (existingDatabase.length === 0) {
      await adminClient.unsafe(
        `create database ${quoteIdentifier(databaseName)}`,
      );
    }
  } finally {
    await adminClient.end();
  }
}

async function dropExistingTables(
  testClient: postgres.Sql<Record<string, unknown>>,
) {
  const existingTables = await testClient<{ tablename: string }[]>`
      select tablename
      from pg_tables
      where schemaname = 'public'
        and tablename like 'en\\_escena\\_%' escape '\\'
      order by tablename
    `;

  if (existingTables.length === 0) {
    return;
  }

  await testClient.unsafe(
    `drop table ${existingTables
      .map((table) => quoteIdentifier(table.tablename))
      .join(", ")} cascade`,
  );
}

async function dropExistingEnums(
  testClient: postgres.Sql<Record<string, unknown>>,
) {
  const existingEnums = await testClient<{ typname: string }[]>`
      select t.typname
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where t.typtype = 'e'
        and n.nspname = 'public'
        and t.typname like 'en\\_escena\\_%' escape '\\'
      order by t.typname
    `;

  if (existingEnums.length === 0) {
    return;
  }

  await testClient.unsafe(
    `drop type ${existingEnums
      .map((enumType) => quoteIdentifier(enumType.typname))
      .join(", ")} cascade`,
  );
}

// El estado de migraciones debe irse junto con el schema: la base de test es un
// Postgres persistente, así que si `drizzle.__drizzle_migrations` sobrevive al
// reset, `drizzle-kit migrate` trata el baseline como aplicado y deja la base
// vacía. Dropear el schema `drizzle` fuerza a migrate a re-aplicar desde cero.
async function dropMigrationState(
  testClient: postgres.Sql<Record<string, unknown>>,
) {
  await testClient.unsafe(`drop schema if exists drizzle cascade`);
}

async function resetTestSchema(
  testClient: postgres.Sql<Record<string, unknown>>,
) {
  await dropExistingTables(testClient);
  await dropExistingEnums(testClient);
  await dropMigrationState(testClient);
}

const testDatabaseUrl = getTestDatabaseUrl();

await ensureDatabaseExists(testDatabaseUrl);

const lockClient = postgres(testDatabaseUrl, { max: 1 });

try {
  await lockClient`
    select pg_advisory_lock(hashtext(${testDatabaseLockKey}))
  `;
  await resetTestSchema(lockClient);

  const result = spawnSync(
    "drizzle-kit",
    ["migrate", "--config=drizzle.config.ts"],
    {
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
      },
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
} finally {
  await lockClient`
    select pg_advisory_unlock(hashtext(${testDatabaseLockKey}))
  `;
  await lockClient.end();
}

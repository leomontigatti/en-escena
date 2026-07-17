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

// Los enums deben quedar fuera de la base junto con las tablas: si sobrevive uno
// que el schema ya no declara, `drizzle-kit push` lo lee como posible rename del
// enum nuevo y abre un prompt interactivo que sin TTY aborta la corrida.
async function resetTestSchema(
  testClient: postgres.Sql<Record<string, unknown>>,
) {
  await dropExistingTables(testClient);
  await dropExistingEnums(testClient);
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
    ["push", "--config=drizzle.config.ts", "--force"],
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

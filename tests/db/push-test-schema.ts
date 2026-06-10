import { spawnSync } from "node:child_process";

import postgres from "postgres";

import { getTestDatabaseUrl } from "./config";

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

async function resetTestSchema(databaseUrl: string) {
  const testClient = postgres(databaseUrl, { max: 1 });

  try {
    await testClient.unsafe("drop schema if exists public cascade");
    await testClient.unsafe("create schema public");
  } finally {
    await testClient.end();
  }
}

const testDatabaseUrl = getTestDatabaseUrl();

await ensureDatabaseExists(testDatabaseUrl);
await resetTestSchema(testDatabaseUrl);

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

process.exit(result.status ?? 1);

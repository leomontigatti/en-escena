const DEFAULT_TEST_DATABASE_URL =
  "postgres://postgres:postgres@localhost:5433/en-escena-test";

export function getTestDatabaseUrl() {
  return process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
}

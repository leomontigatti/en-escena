import { afterAll } from "vitest";

process.env.DB_TEST_BACKEND = "pglite";
process.env.TEST_ACCESS_AUTH_SECRET ??= "test-access-auth-secret";

afterAll(async () => {
  const { closeTestDatabase } = await import("./fast-db");
  await closeTestDatabase();
});

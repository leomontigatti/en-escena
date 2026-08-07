import { afterAll } from "vitest";

import "./pin-auth-base-url";

process.env.DB_TEST_BACKEND = "pglite";
process.env.TEST_ACCESS_AUTH_SECRET ??= "test-access-auth-secret";
// Loaders and actions build their storage client at the boundary (#571), so the
// storage environment is required wherever one is exercised. Signing never
// touches the disk, so the directory does not have to exist.
process.env.STORAGE_VOLUME_DIR ??= "/tmp/en-escena-test-storage";
process.env.STORAGE_URL_SIGNING_SECRET ??= "test-storage-url-signing-secret";

afterAll(async () => {
  const { closeTestDatabase } = await import("./fast-db");
  await closeTestDatabase();
});

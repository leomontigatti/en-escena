import { getTestDatabaseUrl } from "./config";
import "./isolate-storage";
import "./pin-auth-base-url";

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.TEST_ACCESS_AUTH_SECRET ??= "test-access-auth-secret";
// Loaders and actions build their storage client at the boundary (#571), so the
// storage environment is required wherever one is exercised; the directory comes
// from `./isolate-storage`.
process.env.STORAGE_URL_SIGNING_SECRET ??= "test-storage-url-signing-secret";

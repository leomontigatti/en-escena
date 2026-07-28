import { getTestDatabaseUrl } from "./config";
import "./pin-auth-base-url";

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.TEST_ACCESS_AUTH_SECRET ??= "test-access-auth-secret";

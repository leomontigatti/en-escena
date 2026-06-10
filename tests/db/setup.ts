import { getTestDatabaseUrl } from "./config";

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

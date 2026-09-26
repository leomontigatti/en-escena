const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The seed writes demo accounts with a published password, and its screenshots
 * end up in a public repository (docs/agents/pull-requests.md, "UI evidence"),
 * so it only ever runs against a database on this machine.
 */
export function assertLocalDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the local database.");
  }

  let host: string;

  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid connection URL.");
  }

  if (!localHosts.has(host)) {
    throw new Error(
      `Refusing to seed ${host}: DATABASE_URL must point at localhost or 127.0.0.1.`,
    );
  }
}

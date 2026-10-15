import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type Schema = typeof schema;
type Client = ReturnType<typeof postgres>;
type Database = PostgresJsDatabase<Schema>;

// The client lives on `globalThis`, not in a module variable: the dev server
// re-evaluates this module on every edit, and a client per evaluation kept each
// previous pool's connections open until the server stopped. `idle_timeout`
// (seconds) closes the connections a pool stops using. A changed `DATABASE_URL`
// needs a restart of `pnpm dev`: Vite never lets `.env.local` override a key
// already in `process.env`, so a running server keeps the URL it started with.
const globalForDb = globalThis as typeof globalThis & {
  enEscenaDbClient?: Client;
};

let dbInstance: Database | undefined;

function getClient(): Client {
  if (!globalForDb.enEscenaDbClient) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required");
    }
    globalForDb.enEscenaDbClient = postgres(connectionString, {
      idle_timeout: 20,
    });
  }
  return globalForDb.enEscenaDbClient;
}

function getDb(): Database {
  if (!dbInstance) {
    dbInstance = drizzle(getClient(), { schema });
  }
  return dbInstance;
}

// Lazy init: `DATABASE_URL` is not validated and no connection is opened on
// module import, but on first real use. That way a test that only imports `@/db`
// transitively does not require a database. See issue #308.
export const client = new Proxy((() => undefined) as unknown as Client, {
  apply(_target, thisArg, args: unknown[]) {
    return Reflect.apply(
      getClient() as unknown as (...a: unknown[]) => unknown,
      thisArg,
      args,
    );
  },
  get(_target, prop) {
    const instance = getClient();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export const db = new Proxy({} as Database, {
  get(_target, prop) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type Schema = typeof schema;
type Client = ReturnType<typeof postgres>;
type Database = PostgresJsDatabase<Schema>;

let clientInstance: Client | undefined;
let dbInstance: Database | undefined;

function getClient(): Client {
  if (!clientInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required");
    }
    clientInstance = postgres(connectionString);
  }
  return clientInstance;
}

function getDb(): Database {
  if (!dbInstance) {
    dbInstance = drizzle(getClient(), { schema });
  }
  return dbInstance;
}

// Init perezosa: no se valida `DATABASE_URL` ni se abre conexión al importar el
// módulo, sino en el primer uso real. Así un test que solo importa
// transitivamente `@/db` no requiere una base. Ver issue #308.
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

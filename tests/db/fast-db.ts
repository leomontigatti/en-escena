import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { pgliteSchema } from "./pglite-schema";
import { normalizePgliteError } from "./pglite-error-normalization";
import { loadPgliteSchemaSnapshot } from "./pglite-snapshot";

const snapshot = await loadPgliteSchemaSnapshot();
const rawClient = new PGlite({ loadDataDir: snapshot });

export const client = wrapPgliteClient(rawClient);
export const db = drizzle(client, { schema: pgliteSchema });
export const databaseTestBackend = "pglite" as const;

export async function closeTestDatabase() {
  await rawClient.close();
}

function wrapPgliteClient<T extends object>(clientToWrap: T): T {
  return new Proxy(clientToWrap, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (property === "query" && typeof value === "function") {
        return async (...args: unknown[]) => {
          try {
            return await value.apply(target, args);
          } catch (error) {
            throw normalizePgliteError(error);
          }
        };
      }

      if (property === "transaction" && typeof value === "function") {
        return async (
          callback: (transactionClient: T) => Promise<unknown>,
          ...args: unknown[]
        ) => {
          try {
            return await value.call(
              target,
              async (transactionClient: T) =>
                callback(wrapPgliteClient(transactionClient)),
              ...args,
            );
          } catch (error) {
            throw normalizePgliteError(error);
          }
        };
      }

      return value;
    },
  });
}

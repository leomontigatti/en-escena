import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { pgliteSchema } from "./pglite-schema";
import { normalizePgliteError } from "./pglite-error-normalization";
import { loadPgliteSchemaSnapshot } from "./pglite-snapshot";

const snapshot = await loadPgliteSchemaSnapshot();
const rawClient = new PGlite({ loadDataDir: snapshot });

// fallow-ignore-next-line unused-export
export const client = wrapPgliteClient(rawClient);
// fallow-ignore-next-line unused-export
export const db = drizzle(client, { schema: pgliteSchema });

type PgliteMethod = (...args: unknown[]) => Promise<unknown>;

export async function closeTestDatabase() {
  await rawClient.close();
}

function wrapPgliteClient<T extends object>(clientToWrap: T): T {
  return new Proxy(clientToWrap, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (property === "query" && typeof value === "function") {
        return wrapQueryMethod(target, value as PgliteMethod);
      }

      if (property === "transaction" && typeof value === "function") {
        return wrapTransactionMethod(target, value as PgliteMethod);
      }

      return value;
    },
  });
}

function wrapQueryMethod<T extends object>(
  target: T,
  query: (...args: unknown[]) => Promise<unknown>,
) {
  return async (...args: unknown[]) => {
    try {
      return await query.apply(target, args);
    } catch (error) {
      throw normalizePgliteError(error);
    }
  };
}

function wrapTransactionMethod<T extends object>(
  target: T,
  transaction: (...args: unknown[]) => Promise<unknown>,
) {
  return async (
    callback: (transactionClient: T) => Promise<unknown>,
    ...args: unknown[]
  ) => {
    try {
      return await transaction.call(
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

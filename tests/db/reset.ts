import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

// Why not `truncate <every en_escena_ table> restart identity cascade` (issue
// #961): that statement is catalog work proportional to the number of tables,
// not to the number of rows, so it cost 130-260 ms per call (85 ms on this
// repo's CI-sized container) on an *already empty* database and, at ~823 tests,
// roughly half of the DB suite's test time. Postgres tuning (`fsync=off`, ...)
// did not move it, and truncating only the dirty tables does not help either —
// `truncate ... cascade` of a single populated table still measured ~49 ms,
// because the cost is the catalog and cascade work, not the rows.
//
// So each reset instead asks, in one round trip, which `en_escena_%` tables hold
// a row and which sequences have been advanced, and then `delete from` just
// those tables in child-before-parent order (~1.5 ms for a typical test) and
// rewinds just those sequences. The observable result is identical to the old
// statement: every `en_escena_%` table empty and every identity/serial back at
// its start.

type Executor = {
  execute: (query: SQL) => Promise<unknown>;
};

type ResetPlan = {
  // Child-before-parent, so deleting any subset of it never trips a foreign key.
  deletionOrder: string[];
  probeQuery: string;
};

// The schema is fixed for the lifetime of a run, so the plan is resolved once
// per database.
const resetPlanByDatabase = new WeakMap<object, Promise<ResetPlan>>();

const enEscenaLikePattern = String.raw`'en\_escena\_%' escape '\'`;

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Drizzle's Postgres driver returns the rows as an array and PGlite's returns
 * them under `rows`; the harness runs on both.
 */
export function readRows<Row extends object>(result: unknown) {
  if (Array.isArray(result)) {
    return result as Row[];
  }

  return ((result as { rows?: Row[] }).rows ?? []) as Row[];
}

async function loadResetPlan(executor: Executor): Promise<ResetPlan> {
  const tablesResult = await executor.execute(
    sql.raw(`
      select tablename as name
      from pg_tables
      where schemaname = 'public'
        and tablename like ${enEscenaLikePattern}
      order by tablename
    `),
  );
  const tableNames = readRows<{ name: string }>(tablesResult).map(
    (row) => row.name,
  );

  const foreignKeysResult = await executor.execute(
    sql.raw(`
      select
        child.relname as child,
        parent.relname as parent
      from pg_constraint
      join pg_class as child on child.oid = pg_constraint.conrelid
      join pg_class as parent on parent.oid = pg_constraint.confrelid
      join pg_namespace on pg_namespace.oid = child.relnamespace
      where pg_constraint.contype = 'f'
        and pg_namespace.nspname = 'public'
    `),
  );
  const foreignKeys = readRows<ForeignKey>(foreignKeysResult);

  return {
    deletionOrder: orderChildrenFirst(tableNames, foreignKeys),
    probeQuery: buildProbeQuery(tableNames),
  };
}

type ForeignKey = { child: string; parent: string };

function buildParentsOf(tableNames: string[], foreignKeys: ForeignKey[]) {
  const parentsOf = new Map(tableNames.map((name) => [name, [] as string[]]));

  for (const { child, parent } of foreignKeys) {
    // A self-reference is not an edge: `delete from` empties such a table in a
    // single statement.
    if (child !== parent && parentsOf.has(parent)) {
      parentsOf.get(child)?.push(parent);
    }
  }

  return parentsOf;
}

/**
 * Distance from `tableName` to a table that references nothing, so a child
 * always scores above its parents. A cycle is cut at its entry point: its
 * members end up adjacent and are left to the foreign keys' own `on delete`
 * behaviour.
 */
function measureReferenceDepth(
  tableName: string,
  parentsOf: Map<string, string[]>,
  depthOf: Map<string, number>,
  visiting: Set<string>,
): number {
  const known = depthOf.get(tableName);

  if (known !== undefined || visiting.has(tableName)) {
    return known ?? 0;
  }

  visiting.add(tableName);
  const depth = (parentsOf.get(tableName) ?? []).reduce(
    (deepest, parent) =>
      Math.max(
        deepest,
        measureReferenceDepth(parent, parentsOf, depthOf, visiting) + 1,
      ),
    0,
  );
  visiting.delete(tableName);
  depthOf.set(tableName, depth);

  return depth;
}

/**
 * Sorts `tableNames` so that every table comes before the tables it references,
 * which lets any subset of the result be deleted without tripping a foreign key.
 */
function orderChildrenFirst(
  tableNames: string[],
  foreignKeys: ForeignKey[],
): string[] {
  const parentsOf = buildParentsOf(tableNames, foreignKeys);
  const depthOf = new Map<string, number>();

  for (const tableName of tableNames) {
    measureReferenceDepth(tableName, parentsOf, depthOf, new Set());
  }

  return [...tableNames].sort(
    (left, right) => (depthOf.get(right) ?? 0) - (depthOf.get(left) ?? 0),
  );
}

/**
 * One statement that returns a row per table that has data and a row per
 * sequence that has been advanced. `pg_sequences.last_value` is null exactly
 * while the sequence has never been read, which is the state a fresh database —
 * and `alter sequence ... restart` — leaves it in.
 */
function buildProbeQuery(tableNames: string[]) {
  const parts = tableNames.map(
    (tableName) =>
      `select ${quoteLiteral(tableName)} as name, 'table' as kind` +
      ` where exists (select 1 from ${quoteIdentifier(tableName)})`,
  );

  parts.push(`
    select sequencename as name, 'sequence' as kind
    from pg_sequences
    where schemaname = 'public'
      and last_value is not null
  `);

  return parts.join("\nunion all\n");
}

/**
 * The cached plan is dropped again if the catalog read fails, so a connection
 * lost mid-reset does not leave a rejected promise poisoning every later reset
 * against the same database.
 */
function readResetPlan(executor: Executor, planOwner: object) {
  const cached = resetPlanByDatabase.get(planOwner);

  if (cached) {
    return cached;
  }

  const plan = loadResetPlan(executor).catch((error: unknown) => {
    resetPlanByDatabase.delete(planOwner);
    throw error;
  });
  resetPlanByDatabase.set(planOwner, plan);

  return plan;
}

/**
 * Empties every `en_escena_%` table and rewinds every sequence, touching only
 * the objects a test actually dirtied. Statements run on `executor`, which may
 * be a database or an open transaction; `planOwner` is the database that
 * executor belongs to, so a per-test transaction reuses the catalog read rather
 * than repeating it. It is required on purpose: passing the transaction by
 * omission would key the cache on a throwaway object and silently re-read the
 * catalog on every test, which no assertion would catch.
 */
export async function resetDatabaseTables(
  executor: Executor,
  planOwner: object,
) {
  const { deletionOrder, probeQuery } = await readResetPlan(
    executor,
    planOwner,
  );

  const dirtyResult = await executor.execute(sql.raw(probeQuery));
  const dirty = readRows<{ kind: string; name: string }>(dirtyResult);
  const dirtyTables = new Set(
    dirty.filter((row) => row.kind === "table").map((row) => row.name),
  );

  for (const tableName of deletionOrder) {
    if (dirtyTables.has(tableName)) {
      await executor.execute(
        sql.raw(`delete from ${quoteIdentifier(tableName)}`),
      );
    }
  }

  for (const row of dirty) {
    if (row.kind === "sequence") {
      await executor.execute(
        sql.raw(`alter sequence ${quoteIdentifier(row.name)} restart`),
      );
    }
  }
}

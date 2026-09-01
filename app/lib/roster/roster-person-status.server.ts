import { eq, sql, type SQL } from "drizzle-orm";

import { dancers, professors } from "@/db/schema";

import type { RosterPersonStatusFilter } from "@/lib/roster/roster-person-status.shared";

/**
 * The two tables that carry an alta state. They are the same axis, so they get
 * the same predicate rather than one per person kind.
 */
export type RosterPersonTable = typeof dancers | typeof professors;

/**
 * The one place the `active` comparison lives: no reader writes
 * `eq(dancers.active, true)` by hand, which is how the rule ended up stated
 * five different ways.
 */
export function activeRosterPerson(table: RosterPersonTable): SQL {
  return eq(table.active, true);
}

/**
 * The raw-SQL twin, for the participation subqueries that build their SQL by
 * hand and give the table their own alias. Same shape and same reason as
 * `activeInscriptionSql`: a db test compares the two halves over a fixture, so
 * if either moves the other fails.
 */
export function activeRosterPersonSql(personTableAlias: string): SQL {
  return sql`${sql.identifier(personTableAlias)}.${sql.identifier("active")} = true`;
}

/**
 * The filter's condition. `"all"` filters nothing, so it returns `undefined`
 * and the caller leaves the axis out of its `and(...)`.
 */
export function rosterPersonStatusCondition(
  table: RosterPersonTable,
  filter: RosterPersonStatusFilter,
): SQL | undefined {
  switch (filter) {
    case "active":
      return activeRosterPerson(table);
    case "archived":
      return eq(table.active, false);
    case "all":
      return undefined;
  }
}

import { and, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { dancers, professors } from "@/db/schema";

import type {
  RosterPersonKind,
  RosterPersonStatus,
  RosterPersonStatusFilter,
} from "@/lib/roster/roster-person-status.shared";

/** Which surface is writing: the panel writes any person, the portal its own. */
export type RosterPersonWriteSurface = "admin" | "portal";

type RosterPersonRowByKind = {
  dancer: typeof dancers.$inferSelect;
  professor: typeof professors.$inferSelect;
};

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

/**
 * The one writer of the alta state, for both person kinds and both surfaces.
 * It replaces the four near-identical `setXActiveState` functions — two of
 * which shared a name and differed only in whether they scoped by academia —
 * so that a future rule about archiving is written once instead of four times.
 *
 * There is no guard: archiving is never refused, not even for a bailarín
 * inscripto en el Evento activo, and it touches no inscription. The mutation
 * reads no inscription and runs no active-inscription query; it is an
 * existence check and a boolean write. Reactivating always succeeds and puts
 * the person back in the pickers immediately, because the pickers read the
 * column through `isSelectableForRoster` and nothing else.
 *
 * The scope is a runtime value rather than a type — `null` for the panel de
 * administración, which may write any person — so the module asserts it: a
 * portal caller that lost its academia would otherwise silently write across
 * academias.
 */
export async function setRosterPersonStatus<
  Kind extends RosterPersonKind,
>(input: {
  kind: Kind;
  personId: string;
  academyId: string | null;
  surface: RosterPersonWriteSurface;
  next: RosterPersonStatus;
}): Promise<RosterPersonRowByKind[Kind]> {
  if (input.surface === "portal" && input.academyId === null) {
    throw new Error(
      "El portal de academias solo puede cambiar el Estado de alta de su propia academia.",
    );
  }

  const table = input.kind === "dancer" ? dancers : professors;
  const scope =
    input.academyId === null
      ? eq(table.id, input.personId)
      : and(eq(table.id, input.personId), eq(table.academyId, input.academyId));

  const [updatedPerson] = await db
    .update(table)
    .set({ active: input.next === "active", updatedAt: new Date() })
    .where(scope)
    .returning();

  if (!updatedPerson) {
    throw new Response(personNotFoundMessages[input.kind], { status: 404 });
  }

  return updatedPerson as RosterPersonRowByKind[Kind];
}

const personNotFoundMessages: Record<RosterPersonKind, string> = {
  dancer: "No encontramos ese Bailarín.",
  professor: "No encontramos ese Profesor.",
};

import { and, eq, type SQL } from "drizzle-orm";

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
 * The outcome of a write. `"not-found"` is the person the scope did not reach:
 * a missing id, or —from the portal— a person of another academy.
 */
export type RosterPersonStatusWriteResult<Kind extends RosterPersonKind> =
  | { ok: true; person: RosterPersonRowByKind[Kind] }
  | { ok: false; cause: "not-found" };

/**
 * The one place the `active` comparison lives: no reader writes
 * `eq(dancers.active, true)` by hand, which is how the rule ended up stated
 * five different ways.
 */
export function activeRosterPerson(table: RosterPersonTable): SQL {
  return eq(table.active, true);
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
 * which shared a name and differed only in whether they scoped by academy —
 * so that a future rule about archiving is written once instead of four times.
 *
 * There is no guard: archiving is never refused, not even for a dancer with an
 * active inscription in the current event, and it touches no inscription. The
 * mutation
 * reads no inscription and runs no active-inscription query; it is an
 * existence check and a boolean write. Reactivating always succeeds and puts
 * the person back in the pickers immediately, because the pickers read the
 * column through `isSelectableForRoster` and nothing else.
 *
 * The scope is a runtime value rather than a type — `null` for the admin panel,
 * which may write any person — so the module asserts it: a portal caller that
 * lost its academy would otherwise silently write across academies. That
 * assertion stays a `throw`, because it is a programming error rather than
 * something a user can cause.
 *
 * A person the scope does not reach is returned as a typed
 * `{ ok: false, cause: "not-found" }`, not thrown: the HTTP status belongs to
 * the route, which reads the wording from `getRosterPersonNotFoundMessage`.
 */
export async function setRosterPersonStatus<
  Kind extends RosterPersonKind,
>(input: {
  kind: Kind;
  personId: string;
  academyId: string | null;
  surface: RosterPersonWriteSurface;
  next: RosterPersonStatus;
}): Promise<RosterPersonStatusWriteResult<Kind>> {
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
    return { ok: false, cause: "not-found" };
  }

  return { ok: true, person: updatedPerson as RosterPersonRowByKind[Kind] };
}

const personNotFoundMessages: Record<RosterPersonKind, string> = {
  dancer: "No encontramos ese Bailarín.",
  professor: "No encontramos ese Profesor.",
};

/**
 * The wording of the not-found case, owned here alongside the rest of the
 * axis' copy: the route decides the status code, the module the sentence.
 */
export function getRosterPersonNotFoundMessage(kind: RosterPersonKind) {
  return personNotFoundMessages[kind];
}

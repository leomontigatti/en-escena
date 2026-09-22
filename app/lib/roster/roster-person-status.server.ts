import { and, eq, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { dancers, professors } from "@/db/schema";
import { findActiveEventParticipation } from "@/lib/roster/active-event-participation.server";

import {
  getRosterPersonParticipatingMessage,
  type RosterPersonKind,
  type RosterPersonStatus,
  type RosterPersonStatusFilter,
} from "@/lib/roster/roster-person-status.shared";

/** Which surface is writing: the panel writes any person, the portal its own. */
export type RosterPersonWriteSurface = "admin" | "portal";

type RosterPersonRowByKind = {
  dancer: typeof dancers.$inferSelect;
  professor: typeof professors.$inferSelect;
};

/**
 * The two tables that carry a roster person status. They are the same axis, so they get
 * the same predicate rather than one per person kind.
 */
export type RosterPersonTable = typeof dancers | typeof professors;

/**
 * The outcome of a write, and the two causes travel by two different channels.
 * `"not-found"` is the person the scope did not reach: a missing id, or —from
 * the portal— a person of another academy, which the route turns into a 404
 * because it is a URL or a programming error. `"participating"` is a refusal
 * the user caused and can act on, so it returns through `actionData` as a toast
 * like every other user-caused error on those screens.
 */
export type RosterPersonStatusWriteResult<Kind extends RosterPersonKind> =
  | { ok: true; person: RosterPersonRowByKind[Kind] }
  | { ok: false; cause: "not-found" }
  | { ok: false; cause: "participating"; message: string };

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
 * The one writer of the roster person status, for both person kinds and both surfaces.
 * It replaces the four near-identical `setXActiveState` functions — two of
 * which shared a name and differed only in whether they scoped by academy —
 * so that a future rule about archiving is written once instead of four times.
 *
 * Archiving is refused while the person is participating in the **active**
 * event: someone dancing in the event that is running now is, by definition,
 * still being worked with, and archiving means the academy no longer works with
 * them. The predicate is not written here — it is
 * `findActiveEventParticipation`, the same reader the detail screens call to
 * grey the button out, so the server and the screen cannot answer the question
 * differently.
 *
 * The refusal writes nothing: the `active` column is left exactly as it was,
 * and no inscription is read or touched beyond the guard's own query.
 * Reactivating is never refused and puts the person back in the pickers
 * immediately, because the pickers read the column through
 * `isSelectableForRoster` and nothing else.
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
      "The academy portal can only change the roster status of its own academy.",
    );
  }

  const table = input.kind === "dancer" ? dancers : professors;
  const scope =
    input.academyId === null
      ? eq(table.id, input.personId)
      : and(eq(table.id, input.personId), eq(table.academyId, input.academyId));

  // The scope is checked before the guard, so a person of another academy is
  // reported as `"not-found"` whatever they are doing in the event: the
  // participating sentence would otherwise confirm to one academy that another
  // academy's person exists and is dancing.
  const [person] = await db.select({ id: table.id }).from(table).where(scope);

  if (!person) {
    return { ok: false, cause: "not-found" };
  }

  if (
    input.next === "archived" &&
    (await findActiveEventParticipation({
      kind: input.kind,
      personId: input.personId,
    }))
  ) {
    return {
      ok: false,
      cause: "participating",
      message: getRosterPersonParticipatingMessage(input.kind),
    };
  }

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

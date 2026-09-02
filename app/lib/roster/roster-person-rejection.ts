import {
  isSelectableForRoster,
  toRosterPersonStatus,
  type RosterPersonKind,
} from "@/lib/roster/roster-person-status.shared";

/**
 * Why a roster person the academy picked cannot be part of a choreography.
 * There are exactly two causes, and the pure half of the roster module owns
 * both the classification and the wording so that a read and a write cannot
 * disagree about them.
 *
 * `"not-found"` covers a person that does not exist **and** a person that
 * belongs to another academy. The merge is deliberate and it is a privacy
 * decision: telling the two apart would confirm to one academy that another
 * academy's record exists. Its wording says nothing about existence.
 */
export type RosterPersonRejection = {
  personId: string;
  cause: "not-found" | "archived";
};

/**
 * The linked set of a selection that has no choreography to be linked to yet.
 * Registration always classifies against it, so the strict behaviour academies
 * see when they register is the one eligibility rule and not a second policy.
 */
export const noLinkedRosterPeople: ReadonlySet<string> = new Set();

type RosterPersonRow = {
  id: string;
  active: boolean;
};

/**
 * Splits a picked selection into the people that may be part of the
 * choreography and a typed rejection for each of the rest, applying the one
 * eligibility rule to every row.
 *
 * `rows` are the rows the caller read for `selectedIds` scoped to its own
 * academy: an id with no row is `"not-found"`, whether the person does not
 * exist or belongs elsewhere. `linkedPersonIds` are the people already on
 * **this** choreography; registration passes an empty set, which is what makes
 * its strict behaviour a consequence of `isSelectableForRoster` rather than a
 * second policy.
 */
export function classifyRosterPersonSelection<
  Row extends RosterPersonRow,
>(input: {
  selectedIds: string[];
  rows: Row[];
  linkedPersonIds: ReadonlySet<string>;
}): { people: Row[]; rejections: RosterPersonRejection[] } {
  const rowById = new Map(input.rows.map((row) => [row.id, row]));
  const people: Row[] = [];
  const rejections: RosterPersonRejection[] = [];

  for (const personId of input.selectedIds) {
    const row = rowById.get(personId);

    if (!row) {
      rejections.push({ personId, cause: "not-found" });
      continue;
    }

    const isSelectable = isSelectableForRoster({
      status: toRosterPersonStatus(row.active),
      isAlreadyLinked: input.linkedPersonIds.has(personId),
    });

    if (isSelectable) {
      people.push(row);
      continue;
    }

    rejections.push({ personId, cause: "archived" });
  }

  return { people, rejections };
}

const notFoundMessages: Record<RosterPersonKind, string> = {
  dancer: "Elegí bailarines que pertenezcan a tu academia.",
  professor: "Elegí profesores que pertenezcan a tu academia.",
};

const archivedMessages: Record<RosterPersonKind, string> = {
  dancer: "Reactivá este bailarín para poder agregarlo a la coreografía.",
  professor: "Reactivá este profesor para poder agregarlo a la coreografía.",
};

/**
 * One sentence per cause, the archived one first because it is the one the
 * academy can act on: it says what to do, and it uses the verb the rest of the
 * product uses for this action ("Reactivar").
 *
 * The sentence names no one and agrees with the person-kind noun, which is why
 * it is picked by `kind`: the roster stores no gender, so a sentence agreeing
 * with an interpolated name would misgender roughly half of it. The archived
 * sentence is emitted once when at least one archived rejection is present,
 * however many there are.
 */
export function getRosterPersonRejectionMessage(input: {
  kind: RosterPersonKind;
  rejections: RosterPersonRejection[];
}) {
  const hasArchived = input.rejections.some(
    (rejection) => rejection.cause === "archived",
  );
  const hasNotFound = input.rejections.some(
    (rejection) => rejection.cause === "not-found",
  );
  const sentences: string[] = [];

  if (hasArchived) {
    sentences.push(archivedMessages[input.kind]);
  }

  if (hasNotFound) {
    sentences.push(notFoundMessages[input.kind]);
  }

  return sentences.join(" ");
}

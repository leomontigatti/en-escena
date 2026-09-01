import {
  isSelectableForRoster,
  toRosterPersonStatus,
} from "@/lib/roster/roster-person-status.shared";

/**
 * Why a roster person the academy picked cannot be part of a coreografía.
 * There are exactly two causes, and the pure half of the roster module owns
 * both the classification and the wording so that a read and a write cannot
 * disagree about them.
 *
 * `"not-found"` covers a person that does not exist **and** a person that
 * belongs to another academia. The merge is deliberate and it is a privacy
 * decision: telling the two apart would confirm to one academia that another
 * academia's record exists. Its wording says nothing about existence.
 */
export type RosterPersonRejection =
  | { personId: string; cause: "not-found" }
  | { personId: string; cause: "archived"; fullName: string };

export type RosterPersonKind = "dancer" | "professor";

/**
 * The linked set of a selection that has no coreografía to be linked to yet.
 * Registration always classifies against it, so the strict behaviour academies
 * see when they register is the one eligibility rule and not a second policy.
 */
export const noLinkedRosterPeople: ReadonlySet<string> = new Set();

type RosterPersonRow = {
  id: string;
  active: boolean;
  firstName: string;
  lastName: string;
};

/**
 * Splits a picked selection into the people that may be part of the
 * coreografía and a typed rejection for each of the rest, applying the one
 * eligibility rule to every row.
 *
 * `rows` are the rows the caller read for `selectedIds` scoped to its own
 * academia: an id with no row is `"not-found"`, whether the person does not
 * exist or belongs elsewhere. `linkedPersonIds` are the people already on
 * **this** coreografía; registration passes an empty set, which is what makes
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

    rejections.push({
      personId,
      cause: "archived",
      fullName: `${row.firstName} ${row.lastName}`,
    });
  }

  return { people, rejections };
}

const notFoundMessages: Record<RosterPersonKind, string> = {
  dancer: "Elegí bailarines que pertenezcan a tu academia.",
  professor: "Elegí profesores que pertenezcan a tu academia.",
};

/**
 * One sentence per cause, the archived one first because it is the one the
 * academia can act on: it names the people and says what to do with them.
 */
export function getRosterPersonRejectionMessage(input: {
  kind: RosterPersonKind;
  rejections: RosterPersonRejection[];
}) {
  const archivedNames = input.rejections
    .filter((rejection) => rejection.cause === "archived")
    .map((rejection) => rejection.fullName);
  const hasNotFound = input.rejections.some(
    (rejection) => rejection.cause === "not-found",
  );
  const sentences: string[] = [];

  if (archivedNames.length === 1) {
    sentences.push(
      `${archivedNames[0]} está archivado. Reactivalo para poder agregarlo a la coreografía.`,
    );
  } else if (archivedNames.length > 1) {
    sentences.push(
      `${formatNameList(archivedNames)} están archivados. Reactivalos para poder agregarlos a la coreografía.`,
    );
  }

  if (hasNotFound) {
    sentences.push(notFoundMessages[input.kind]);
  }

  return sentences.join(" ");
}

function formatNameList(names: string[]) {
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

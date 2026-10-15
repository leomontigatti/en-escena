import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { dancers, professors, seminarInscriptions } from "@/db/schema";

import type {
  InscriptionPersonKind,
  RosterPersonKind,
} from "@/lib/roster/roster-person-kind.shared";

/**
 * The Drizzle half of `rosterPersonKind`: which table a kind lives in, and the
 * seminar inscription's person arc. The pure half —the pair and its nouns— is
 * `roster-person-kind.shared.ts`.
 */

/** The two tables a roster person lives in. */
export type RosterPersonTable = typeof dancers | typeof professors;

export function rosterPersonTable(kind: RosterPersonKind): RosterPersonTable {
  return kind === "dancer" ? dancers : professors;
}

/**
 * The person a seminar inscription is for. It names the person and nothing
 * about who registered them: the arc is the person's kind and id, so a reader
 * that needs the owner academy reads it off the person, and a person with no
 * real academy behind them —an `individual`, owned by its own owner row— can
 * still be the one an inscription names.
 */
export type SeminarInscriptionPerson = {
  kind: InscriptionPersonKind;
  personId: string;
};

type SeminarInscriptionPersonColumns = {
  dancerId: AnyPgColumn;
  individualId: AnyPgColumn;
  professorId: AnyPgColumn;
};

type SeminarInscriptionPersonRow = {
  dancerId: string | null;
  individualId: string | null;
  professorId: string | null;
};

const personColumnByKind = {
  dancer: "dancerId",
  individual: "individualId",
  professor: "professorId",
} as const satisfies Record<
  InscriptionPersonKind,
  keyof SeminarInscriptionPersonRow
>;

/**
 * The column of `seminarInscriptions` —or of an alias of it— that carries a
 * person of this kind.
 */
export function seminarInscriptionPersonColumn(
  kind: InscriptionPersonKind,
): (typeof seminarInscriptions)["dancerId" | "individualId" | "professorId"];
export function seminarInscriptionPersonColumn<
  Table extends SeminarInscriptionPersonColumns,
>(
  kind: InscriptionPersonKind,
  table: Table,
): Table["dancerId" | "individualId" | "professorId"];
export function seminarInscriptionPersonColumn(
  kind: InscriptionPersonKind,
  table: SeminarInscriptionPersonColumns = seminarInscriptions,
) {
  return table[personColumnByKind[kind]];
}

/**
 * The code side of the `seminar_inscription_exactly_one_person` CHECK: the
 * triple a write stores, one id set and the other two null.
 */
export function seminarInscriptionPersonValues(
  person: SeminarInscriptionPerson,
): SeminarInscriptionPersonRow {
  return {
    dancerId: null,
    individualId: null,
    professorId: null,
    [personColumnByKind[person.kind]]: person.personId,
  };
}

/**
 * The person a stored row names. Two or none is a row the CHECK refuses, so
 * meeting one is a programming error —a row built by hand, a select that
 * dropped a column— and it throws rather than returning a guess.
 */
export function seminarInscriptionPersonOf(
  row: SeminarInscriptionPersonRow,
): SeminarInscriptionPerson {
  const named = (
    Object.entries(personColumnByKind) as [
      InscriptionPersonKind,
      keyof SeminarInscriptionPersonRow,
    ][]
  ).flatMap(([kind, column]) => {
    const personId = row[column];

    return personId === null ? [] : [{ kind, personId }];
  });

  if (named.length !== 1) {
    throw new Error(
      "A seminar inscription names exactly one person: a dancer, a professor or an individual.",
    );
  }

  return named[0];
}

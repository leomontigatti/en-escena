import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { dancers, professors, seminarInscriptions } from "@/db/schema";

import type { RosterPersonKind } from "@/lib/roster/roster-person-kind.shared";

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
 * that needs the registering academy reads it off the person, and a person
 * with no real academy behind them can still be the one an inscription names.
 */
export type SeminarInscriptionPerson = {
  kind: RosterPersonKind;
  personId: string;
};

type SeminarInscriptionPersonColumns = {
  dancerId: AnyPgColumn;
  professorId: AnyPgColumn;
};

type SeminarInscriptionPersonRow = {
  dancerId: string | null;
  professorId: string | null;
};

/**
 * The column of `seminarInscriptions` —or of an alias of it— that carries a
 * person of this kind.
 */
export function seminarInscriptionPersonColumn(
  kind: RosterPersonKind,
): (typeof seminarInscriptions)["dancerId" | "professorId"];
export function seminarInscriptionPersonColumn<
  Table extends SeminarInscriptionPersonColumns,
>(kind: RosterPersonKind, table: Table): Table["dancerId" | "professorId"];
export function seminarInscriptionPersonColumn(
  kind: RosterPersonKind,
  table: SeminarInscriptionPersonColumns = seminarInscriptions,
) {
  return kind === "dancer" ? table.dancerId : table.professorId;
}

/**
 * The code side of the `seminar_inscription_exactly_one_person` CHECK: the
 * pair a write stores, one id set and the other null. Its type cannot hold
 * both or neither.
 */
export function seminarInscriptionPersonValues(
  person: SeminarInscriptionPerson,
):
  | { dancerId: string; professorId: null }
  | { dancerId: null; professorId: string } {
  return person.kind === "dancer"
    ? { dancerId: person.personId, professorId: null }
    : { dancerId: null, professorId: person.personId };
}

/**
 * The person a stored row names. Both or neither is a row the CHECK refuses,
 * so meeting one is a programming error —a row built by hand, a select that
 * dropped a column— and it throws rather than returning a guess.
 */
export function seminarInscriptionPersonOf(
  row: SeminarInscriptionPersonRow,
): SeminarInscriptionPerson {
  if (row.dancerId !== null && row.professorId === null) {
    return { kind: "dancer", personId: row.dancerId };
  }

  if (row.professorId !== null && row.dancerId === null) {
    return { kind: "professor", personId: row.professorId };
  }

  throw new Error(
    "A seminar inscription names exactly one person: a dancer or a professor.",
  );
}

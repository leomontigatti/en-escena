import { listIndividualsLinkedRosterRows } from "@/lib/individuals/link.server";
import { readEventParticipation } from "@/lib/participation/participation.server";

import type { Executor } from "./choreography-cobro-support.server";

/** The person columns of a seminar inscription, exactly one of them set. */
export type SeminarInscriptionPersonIds = {
  dancerId: string | null;
  individualId: string | null;
  professorId: string | null;
};

/** Who among the people the inscriptions name is `Participando` in the
 * event: the participant cell of their price. */
export type SeminarParticipation = {
  dancerIds: Set<string>;
  individualIds: Set<string>;
  professorIds: Set<string>;
};

/**
 * The participant cell of a set of seminar inscriptions, in one read.
 *
 * - A dancer or a professor is read **on the roster row the inscription
 *   names**: a person dancing for academy A and registered by academy B is a
 *   non-participant on B's row (#615 is where that could change).
 * - An individual (ADR-0019) is participating when any row its `Vinculado`
 *   link reaches, in any academy and whatever its `Estado de alta`, is; without
 *   a confirmed link it reaches none and pays the ordinary price.
 *
 * Once the deposit is covered the stored price row freezes the cell, so a
 * change here no longer moves a covered inscription's price.
 */
export async function readSeminarParticipation(
  executor: Executor,
  input: {
    eventId: string;
    rows: readonly SeminarInscriptionPersonIds[];
  },
): Promise<SeminarParticipation> {
  const links = await listIndividualsLinkedRosterRows(
    collectPersonIds(input.rows, "individualId"),
    executor,
  );
  const linkedRowIds = (kind: "dancer" | "professor") =>
    links
      .filter((link) => link.rosterRowKind === kind)
      .map((link) => link.rosterRowId);
  const participation = await readEventParticipation(executor, {
    dancerIds: [
      ...new Set([
        ...collectPersonIds(input.rows, "dancerId"),
        ...linkedRowIds("dancer"),
      ]),
    ],
    eventId: input.eventId,
    professorIds: [
      ...new Set([
        ...collectPersonIds(input.rows, "professorId"),
        ...linkedRowIds("professor"),
      ]),
    ],
  });
  const reachesParticipant = (link: (typeof links)[number]) =>
    (link.rosterRowKind === "dancer"
      ? participation.dancerIds
      : participation.professorIds
    ).has(link.rosterRowId);

  return {
    ...participation,
    individualIds: new Set(
      links.filter(reachesParticipant).map((link) => link.individualId),
    ),
  };
}

/** The participant cell an individual registering now would be priced in. */
export async function isIndividualParticipating(
  executor: Executor,
  input: { eventId: string; individualId: string },
): Promise<boolean> {
  const row = {
    dancerId: null,
    individualId: input.individualId,
    professorId: null,
  };

  return isParticipating(
    row,
    await readSeminarParticipation(executor, {
      eventId: input.eventId,
      rows: [row],
    }),
  );
}

/** Whether the person an inscription names is `Participando` in the event,
 * which picks their price cell. */
export function isParticipating(
  row: SeminarInscriptionPersonIds,
  participation: SeminarParticipation,
): boolean {
  if (row.dancerId !== null) {
    return participation.dancerIds.has(row.dancerId);
  }

  if (row.professorId !== null) {
    return participation.professorIds.has(row.professorId);
  }

  return (
    row.individualId !== null &&
    participation.individualIds.has(row.individualId)
  );
}

function collectPersonIds(
  rows: readonly SeminarInscriptionPersonIds[],
  column: keyof SeminarInscriptionPersonIds,
): string[] {
  return [
    ...new Set(
      rows
        .map((row) => row[column])
        .filter((personId): personId is string => personId !== null),
    ),
  ];
}

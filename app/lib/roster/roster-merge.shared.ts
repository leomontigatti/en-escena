import type { RosterPersonKind } from "./roster-person-status.shared";

export const rosterMergeIntents = {
  dancer: "merge-dancer",
  professor: "merge-professor",
} as const satisfies Record<RosterPersonKind, string>;

export type RosterMergeCandidate = {
  active: boolean;
  documentNumber: string | null;
  firstName: string;
  id: string;
  lastName: string;
};

export type RosterMergeEventInscriptions = {
  choreographies: number;
  eventName: string;
  seminars: number;
};

const kindCopy = {
  dancer: {
    notFoundMessage: "No encontramos ese Bailarín.",
    otherAcademyMessage:
      "Solo se pueden fusionar bailarines de la misma academia.",
    sameRowMessage: "Elegí otro bailarín para fusionar.",
    singular: "bailarín",
    survivorNotFoundMessage:
      "No encontramos el bailarín que queda. Elegí otro bailarín de la academia.",
  },
  professor: {
    notFoundMessage: "No encontramos ese Profesor.",
    otherAcademyMessage:
      "Solo se pueden fusionar profesores de la misma academia.",
    sameRowMessage: "Elegí otro profesor para fusionar.",
    singular: "profesor",
    survivorNotFoundMessage:
      "No encontramos el profesor que queda. Elegí otro profesor de la academia.",
  },
} as const satisfies Record<RosterPersonKind, Record<string, string>>;

export function getRosterMergeKindCopy(kind: RosterPersonKind) {
  return kindCopy[kind];
}

export function formatRosterMergeCandidateLabel(
  candidate: RosterMergeCandidate,
) {
  const name = `${candidate.lastName}, ${candidate.firstName}`;
  const document = candidate.documentNumber
    ? ` · ${candidate.documentNumber}`
    : " · sin documento";

  return `${name}${document}${candidate.active ? "" : " · archivado"}`;
}

/**
 * The confirmation's two lists: what moves to the survivor and what is lost
 * with the removed row. Which document survives depends on the survivor, so
 * the summary is rebuilt whenever the survivor changes.
 */
export function describeRosterMerge(input: {
  inscriptionsByEvent: RosterMergeEventInscriptions[];
  kind: RosterPersonKind;
  removed: { documentNumber: string | null; name: string };
  survivor: RosterMergeCandidate;
}) {
  const survivorName = `${input.survivor.firstName} ${input.survivor.lastName}`;
  const moves = input.inscriptionsByEvent.map((event) => {
    const parts = [
      pluralize(event.choreographies, "coreografía", "coreografías"),
      pluralize(event.seminars, "seminario", "seminarios"),
    ].filter((part): part is string => part !== null);

    return `${event.eventName}: ${parts.join(" y ")}.`;
  });
  const takesDocument =
    input.survivor.documentNumber === null &&
    input.removed.documentNumber !== null;
  const discards = [
    `${input.removed.name}: nombre, ${
      input.kind === "dancer" ? "fecha de nacimiento, " : ""
    }estado de alta${takesDocument || input.removed.documentNumber === null ? "" : " y documento"}.`,
  ];

  if (takesDocument) {
    moves.push(
      `El documento ${input.removed.documentNumber}${
        input.kind === "dancer" ? ", sus imágenes y su verificación" : ""
      } pasan a ${survivorName}, que no tiene documento.`,
    );
  }

  return { discards, moves, survivorName };
}

function pluralize(total: number, singular: string, plural: string) {
  if (total === 0) {
    return null;
  }

  return `${total} ${total === 1 ? singular : plural}`;
}

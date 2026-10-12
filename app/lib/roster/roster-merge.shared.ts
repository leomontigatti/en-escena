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
  removed: {
    documentNumber: string | null;
    isIdentityVerified: boolean;
    name: string;
  };
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
    }estado de alta${describeDiscardedDocument({
      discardsDocument: !takesDocument && input.removed.documentNumber !== null,
      isIdentityVerified: input.removed.isIdentityVerified,
    })}.`,
  ];

  if (takesDocument) {
    moves.push(
      input.kind === "dancer"
        ? `El documento ${input.removed.documentNumber} y sus imágenes pasan a ${survivorName}, que no tiene documento.`
        : `El documento ${input.removed.documentNumber} pasa a ${survivorName}, que no tiene documento.`,
    );
  }

  // The survivor keeps its own name and birth date, which the document was
  // never checked against, so a verification never travels with it.
  if (takesDocument && input.removed.isIdentityVerified) {
    moves.push(
      `La identidad de ${input.removed.name} está verificada, pero la verificación no pasa: ${survivorName} queda sin verificar y hay que volver a verificarla.`,
    );
  }

  return { discards, moves, survivorName };
}

function describeDiscardedDocument(input: {
  discardsDocument: boolean;
  isIdentityVerified: boolean;
}) {
  if (!input.discardsDocument) {
    return "";
  }

  return input.isIdentityVerified
    ? " y documento, con su verificación"
    : " y documento";
}

function pluralize(total: number, singular: string, plural: string) {
  if (total === 0) {
    return null;
  }

  return `${total} ${total === 1 ? singular : plural}`;
}

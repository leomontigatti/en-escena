import { pluralize } from "@/lib/shared/text-normalization";

import {
  rosterPersonNoun,
  type RosterPersonKind,
} from "./roster-person-kind.shared";

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

/**
 * The merge's refusals, one sentence each with the kind's noun in it, so the
 * dancer merge and the professor merge cannot drift into two explanations. A
 * removed person that is not there is the roster's own not-found sentence,
 * `getRosterPersonNotFoundMessage`.
 */
export function getRosterMergeKindCopy(kind: RosterPersonKind) {
  const singular = rosterPersonNoun(kind, "singular");

  return {
    otherAcademyMessage: `Solo se pueden fusionar ${rosterPersonNoun(kind, "plural")} de la misma academia.`,
    sameRowMessage: `Elegí otro ${singular} para fusionar.`,
    survivorNotFoundMessage: `No encontramos el ${singular} que queda. Elegí otro ${singular} de la academia.`,
  };
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

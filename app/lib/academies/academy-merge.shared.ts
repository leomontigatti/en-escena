export const mergeAcademyIntent = "merge-academy";

export type AcademyMergeCandidate = {
  email: string;
  id: string;
  name: string;
};

/** What the removed academy holds, counted for the confirmation. */
export type AcademyMergeHoldings = {
  choreographies: number;
  comprobantes: number;
  dancers: number;
  payments: number;
  professors: number;
};

export function formatAcademyMergeCandidateLabel(
  candidate: AcademyMergeCandidate,
) {
  return `${candidate.name} · ${candidate.email}`;
}

/**
 * The confirmation's two lists for an academy merge. Seminar inscriptions and
 * allocations are not listed apart: they belong to the people and the payments
 * that move, and go with them.
 */
export function describeAcademyMerge(input: {
  holdings: AcademyMergeHoldings;
  removed: { email: string; name: string };
  survivor: AcademyMergeCandidate;
}) {
  const { holdings } = input;
  const moves = [
    pluralize(holdings.dancers, "bailarín", "bailarines"),
    pluralize(holdings.professors, "profesor", "profesores"),
    pluralize(holdings.choreographies, "coreografía", "coreografías"),
    pluralize(holdings.payments, "pago", "pagos"),
  ].filter((line): line is string => line !== null);

  if (holdings.dancers + holdings.professors > 0) {
    moves.push("Las inscripciones a seminarios de esas personas.");
  }

  return {
    discards: [
      `${input.removed.name}: nombre y datos de contacto.`,
      `El usuario de acceso ${input.removed.email}, que deja de poder ingresar.`,
    ],
    moves,
    survivorName: input.survivor.name,
  };
}

function pluralize(total: number, singular: string, plural: string) {
  if (total === 0) {
    return null;
  }

  return `${total} ${total === 1 ? singular : plural}.`;
}

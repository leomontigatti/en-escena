import { withdrawnChoreographyStatusLabel } from "@/lib/choreographies/operational-status";
import type { PresentationWarningKind } from "@/lib/presentations/warnings";

import { readPresentationStatus, type PresentationListItem } from "./shared";

/**
 * The row's one badge in the participation list's `Estado` column, decided
 * apart from how it is drawn. A row without a number has no badge of its own:
 * its empty number and its place at the end of the list already say it.
 */
export type PresentationStatusBadge = {
  label: string;
  /** What the tooltip lists, most relevant first; none for an evaluation. */
  messages: string[];
  variant: "destructive" | "secondary" | "success" | "warning";
};

/**
 * The warnings, most relevant first. `Sin jueces` leads and is the one drawn
 * as destructive: a presentation nobody judges cannot be scored, which the
 * rest only make awkward.
 */
const warningTriage: {
  kind: PresentationWarningKind;
  label: string;
}[] = [
  { kind: "missingJudges", label: "Sin jueces" },
  { kind: "belowDeposit", label: "Seña pendiente" },
  { kind: "evaluatedSchedule", label: "Cronograma evaluado" },
  { kind: "dancerSpacing", label: "Separación" },
  { kind: "outOfBlock", label: "Fuera de bloque" },
  { kind: "missingLevel", label: "Nivel sin asignar" },
];

/**
 * What an evaluated row's badge says. It replaces the warning badge rather
 * than joining it: the warnings exist to be fixed before the presentation is
 * judged, so once it has been they have nothing left to ask for. No count and
 * no tooltip: the badge is the whole answer, and what the panel gave is read
 * in the scores view the row's name leads to.
 */
const evaluationBadges = {
  disqualified: { label: "Descalificada", variant: "destructive" },
  evaluated: { label: "Evaluada", variant: "success" },
} as const;

export function readPresentationStatusBadge(
  row: Pick<
    PresentationListItem,
    "evaluationStatus" | "warnings" | "withdrawn"
  >,
): PresentationStatusBadge | null {
  const status = readPresentationStatus(row);

  // A withdrawn presentation keeps its number and is never judged, so the
  // withdrawal is the whole answer, worded and coloured as on every other list.
  if (status === "retirada") {
    return {
      label: withdrawnChoreographyStatusLabel,
      messages: [],
      variant: "secondary",
    };
  }

  if (status === "evaluada") {
    return { ...evaluationBadges.evaluated, messages: [] };
  }

  if (status === "descalificada") {
    return { ...evaluationBadges.disqualified, messages: [] };
  }

  const sorted = [...row.warnings].sort(
    (left, right) => triageRank(left.kind) - triageRank(right.kind),
  );
  const top = warningTriage.find((entry) => entry.kind === sorted[0]?.kind);

  if (!top) {
    return null;
  }

  return {
    label: top.label,
    messages: sorted.map((warning) => warning.message),
    variant: top.kind === "missingJudges" ? "destructive" : "warning",
  };
}

function triageRank(kind: PresentationWarningKind) {
  return warningTriage.findIndex((entry) => entry.kind === kind);
}

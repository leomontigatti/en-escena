import { formatScoreFieldValue } from "@/lib/judging/score-value";

/**
 * How one judge's own work on a presentation stands, shown only to that judge.
 * It is not the presentation's `Estado de participación`, which administration
 * reads and which answers for the whole panel — both use the word "Pendiente"
 * and they mean different things. See CONTEXT.md and docs/domain/judging.md.
 */

export type JudgeScoreStatus =
  "pending" | "complete" | "noFeedback" | "disqualified";

export type JudgeScoreStatusInput = {
  disqualified: boolean;
  hasFeedbackAudio: boolean;
  /** The saved score, as the numeric column reads it, or null when there is none. */
  value: string | null;
};

export function deriveJudgeScoreStatus(
  input: JudgeScoreStatusInput,
): JudgeScoreStatus {
  if (input.disqualified) {
    return "disqualified";
  }

  // A score row with no value is a judge who only left a `Devolución` on a
  // presentation the panel had disqualified, so there is still no score.
  if (input.value === null) {
    return "pending";
  }

  return input.hasFeedbackAudio ? "complete" : "noFeedback";
}

export type JudgeScoreStatusBadge = {
  label: string;
  variant: "destructive" | "outline" | "success" | "warning";
};

/**
 * What the `Estado` cell of the judge's own list shows. A score shows its
 * number, written as every score in the app is, and only the judge's own: the
 * row carries no one else's. On the open day a score without a `Devolución` is
 * a warning rather than a fault, since the take is optional, so that the judge
 * notices it while it can still be recorded; on any other day it can no longer
 * be fixed, and the score reads as the score.
 */
export function judgeScoreStatusBadge(row: {
  /** Whether the row's day is the judging day, the only one open to writes. */
  isOpen: boolean;
  status: JudgeScoreStatus;
  value: string | null;
}): JudgeScoreStatusBadge {
  switch (row.status) {
    case "complete":
      return { label: formatScoreFieldValue(row.value), variant: "success" };
    case "disqualified":
      return { label: "Descalificada", variant: "destructive" };
    case "noFeedback":
      return row.isOpen
        ? { label: "Sin devolución", variant: "warning" }
        : { label: formatScoreFieldValue(row.value), variant: "success" };
    case "pending":
      return { label: "Pendiente", variant: "outline" };
  }
}

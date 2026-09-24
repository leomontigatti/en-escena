/**
 * How one judge's own work on a presentation stands, shown only to that judge.
 * It is not the presentation's `Estado de participación`, which administration
 * reads and which answers for the whole panel — both use the word "Pendiente"
 * and they mean different things. See CONTEXT.md and docs/domain/judging.md.
 */

export type JudgeScoreStatus =
  "pendiente" | "completa" | "sinDevolucion" | "descalificada";

export const judgeScoreStatusLabels: Record<JudgeScoreStatus, string> = {
  completa: "Completa",
  descalificada: "Descalificada",
  pendiente: "Pendiente",
  sinDevolucion: "Sin devolución",
};

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
    return "descalificada";
  }

  // A score row with no value is a judge who only left a `Devolución` on a
  // presentation the panel had disqualified, so there is still no score.
  if (input.value === null) {
    return "pendiente";
  }

  return input.hasFeedbackAudio ? "completa" : "sinDevolucion";
}

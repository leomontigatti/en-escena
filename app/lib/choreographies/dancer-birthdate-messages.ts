import {
  formatChoreographyReferences,
  type ChoreographyReference,
} from "@/lib/choreographies/choreography-messages";

/**
 * A choreography the correction moved to another show, as the success feedback
 * names it: the choreography, and the schedule it landed in.
 */
export type DancerBirthDateScheduleMove = {
  choreography: ChoreographyReference;
  scheduleName: string;
};

/**
 * What the correction moved, one sentence per choreography, for the feedback
 * both dancer forms render on success.
 */
export function buildDancerBirthDateScheduleMoveMessages(
  scheduleMoves: DancerBirthDateScheduleMove[],
): string[] {
  return scheduleMoves.map(
    (move) =>
      `La coreografía ${formatChoreographyReferences([move.choreography])} pasó al cronograma ${move.scheduleName}.`,
  );
}

/**
 * The saved-dancer feedback with what the correction moved appended to it, so
 * both dancer forms report the schedule change in the same sentence shape and
 * neither has to word it itself.
 */
export function withDancerBirthDateScheduleMoveFeedback(
  message: string,
  scheduleMoves: DancerBirthDateScheduleMove[],
): string {
  return [
    message,
    ...buildDancerBirthDateScheduleMoveMessages(scheduleMoves),
  ].join(" ");
}

/**
 * The one sentence both refusals of a birth-date correction are shaped like:
 * the blocked choreographies, named, and what the new birth date leaves them
 * without.
 */
export function buildDancerBirthDateRefusalMessage(
  blockedChoreographies: ChoreographyReference[],
  outcome: string,
): string {
  const isSingular = blockedChoreographies.length === 1;
  const list = formatChoreographyReferences(blockedChoreographies);
  const subject = isSingular
    ? `la coreografía ${list}`
    : `las coreografías ${list}`;

  return `Con esta fecha de nacimiento, ${subject} ${isSingular ? "queda" : "quedan"} ${outcome}.`;
}

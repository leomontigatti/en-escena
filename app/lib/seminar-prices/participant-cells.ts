import type { SeminarKind } from "@/lib/seminars/seminar-kinds";

/**
 * The two halves of the participant axis. A seminar price row prices one of
 * them and there is no fallback across them, so every cell of the fallback tier
 * (`regular`) has to be filled before a seminar can be registered into.
 */
export const participantCellValues = [true, false] as const;

const participantCellLabels = {
  true: "Participante",
  false: "No participante",
} as const;

/** How a row's participant cell is read on a badge, qualifying one person. */
export function getParticipantCellLabel(forParticipants: boolean) {
  return participantCellLabels[forParticipants ? "true" : "false"];
}

/**
 * The cells whose deadline-less `regular` row is missing, in the order they are
 * shown. While the list is not empty every seminar of the event is closed to
 * registration: an inscription of that cell would resolve to no price at all.
 */
function findUncoveredParticipantCells(
  rows: Array<{
    kind: SeminarKind;
    forParticipants: boolean;
    paymentDeadline: string | null;
  }>,
) {
  return participantCellValues.filter(
    (forParticipants) =>
      !rows.some(
        (row) =>
          row.kind === "regular" &&
          row.paymentDeadline === null &&
          row.forParticipants === forParticipants,
      ),
  );
}

export function hasCompleteSeminarPriceCells(
  rows: Array<{
    kind: SeminarKind;
    forParticipants: boolean;
    paymentDeadline: string | null;
  }>,
) {
  return findUncoveredParticipantCells(rows).length === 0;
}

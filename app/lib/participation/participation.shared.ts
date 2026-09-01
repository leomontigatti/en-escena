/**
 * The single participation vocabulary for admin and portal: both surfaces derive
 * the state the same way and name it the same way.
 */
export type ParticipationStatus =
  | "participating"
  | "not-participating"
  | "no-event";

/**
 * The states that are actually shown. With no active event there is nothing to
 * report: both surfaces hide the badge instead of naming `no-event`.
 */
export type ShownParticipationStatus = Exclude<ParticipationStatus, "no-event">;

export function toParticipationStatus(
  selectedEventId: string | null,
  isParticipating: boolean,
): ParticipationStatus {
  if (selectedEventId === null) {
    return "no-event";
  }

  return isParticipating ? "participating" : "not-participating";
}

export function getParticipationLabel(status: ShownParticipationStatus) {
  switch (status) {
    case "participating":
      return "Participando";
    case "not-participating":
      return "No participando";
  }
}

export function getParticipationBadgeVariant(status: ShownParticipationStatus) {
  return status === "participating" ? "success" : "secondary";
}

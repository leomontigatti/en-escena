/**
 * Vocabulario único de participación para admin y portal: las dos superficies
 * derivan el estado igual y lo nombran igual.
 */
export type ParticipationStatus =
  | "participating"
  | "not-participating"
  | "no-event";

export function toParticipationStatus(
  selectedEventId: string | null,
  isParticipating: boolean,
): ParticipationStatus {
  if (selectedEventId === null) {
    return "no-event";
  }

  return isParticipating ? "participating" : "not-participating";
}

export function getParticipationLabel(status: ParticipationStatus) {
  switch (status) {
    case "participating":
      return "Participando";
    case "not-participating":
      return "No participando";
    case "no-event":
      return "Sin evento";
  }
}

export function getParticipationBadgeVariant(status: ParticipationStatus) {
  return status === "participating" ? "success" : "secondary";
}

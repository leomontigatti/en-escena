/**
 * Vocabulario único de participación para admin y portal: las dos superficies
 * derivan el estado igual y lo nombran igual.
 */
export type ParticipationStatus =
  | "participating"
  | "not-participating"
  | "no-event";

/**
 * Los estados que sí se muestran. Sin evento activo no hay nada que informar:
 * las dos superficies esconden el badge en vez de nombrar `no-event`.
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

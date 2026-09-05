import type { useModalityForm } from "./use-modality-form";
import type { useRosterForm } from "./use-roster-form";
import type { useScheduleCapacityForm } from "./use-schedule-capacity-form";

/**
 * The detail page carries three forms and one `Guardar`. They exclude each
 * other on screen, so at any moment exactly one of them owns the button; this
 * module names that owner and reports what the footer should show for it.
 */
export type PendingSave = "modality" | "roster" | "schedule-capacity";

export function getPendingSave({
  hasPendingScheduleCapacity,
  isModalityDirty,
}: {
  hasPendingScheduleCapacity: boolean;
  isModalityDirty: boolean;
}): PendingSave {
  if (isModalityDirty) {
    return "modality";
  }

  if (hasPendingScheduleCapacity) {
    return "schedule-capacity";
  }

  return "roster";
}

/** What the shared `Guardar` reports for the form that owns it right now. */
export function getFooterState({
  canSubmitModality,
  canSubmitRoster,
  modality,
  pendingSave,
  roster,
  scheduleCapacity,
}: {
  canSubmitModality: boolean;
  canSubmitRoster: boolean;
  modality: ReturnType<typeof useModalityForm>;
  pendingSave: PendingSave;
  roster: ReturnType<typeof useRosterForm>;
  scheduleCapacity: ReturnType<typeof useScheduleCapacityForm>;
}) {
  if (pendingSave === "modality") {
    return {
      canSubmit: canSubmitModality,
      isPending: modality.isResolving || modality.isSubmitting,
    };
  }

  if (pendingSave === "schedule-capacity") {
    return {
      canSubmit: scheduleCapacity.canSave,
      isPending: scheduleCapacity.isSubmitting,
    };
  }

  return {
    canSubmit: canSubmitRoster,
    isPending: roster.isResolving || roster.isSubmitting,
  };
}

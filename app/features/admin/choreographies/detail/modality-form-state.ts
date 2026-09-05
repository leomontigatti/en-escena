import {
  isEveryScheduleCapacityOptionFull,
  type ScheduleCapacitySelectOption,
} from "@/lib/choreographies/schedule-capacity-options";

import type {
  ChoreographyModalityOption,
  ChoreographyModalityResolution,
} from "./modality.server";

type CanSubmitModalityInput = {
  canCorrectModality: boolean;
  isResolving: boolean;
  isSubmitting: boolean;
  persistedModalityId: string;
  resolution: ChoreographyModalityResolution | null;
  resolvedModalityId: string;
  selectedModalityId: string;
  watchedExperienceLevelId: string;
  watchedScheduleCapacityId: string;
  watchedSubmodalityId: string;
};

export type ResolvedModalityFieldState = {
  nextExperienceLevelId: string;
  nextScheduleCapacityId: string;
  nextSubmodalityId: string;
};

/**
 * The reason travels on the option, not in a separate message: a modality no
 * schedule accepts is a structural dead end, and whoever sees it greyed out
 * has to know why without going looking for it.
 */
const noCompatibleScheduleOptionSuffix = " (sin cronograma compatible)";

/**
 * A select where no compatible capacity has room is a silent dead end, exactly as
 * in the portal registration: it is replaced by the reason.
 */
export const everyModalityScheduleCapacityFullMessage =
  "Los cronogramas compatibles con esta modalidad ya no tienen lugar. Elegí otra modalidad para corregirla.";

/**
 * The other dead end, and the one the price filter can now reach with the
 * modality still offered: the destination accepts the choreography, and every
 * capacity it has either does not exist for its group type or would reprice an
 * inscription with money assigned. The modality select stays structural —money
 * never greys a modality— so this is where that combination is explained.
 */
export const noModalityScheduleCapacityMessage =
  "Ningún cronograma compatible con esta modalidad está disponible para esta coreografía. Elegí otra modalidad para corregirla.";

/**
 * Why the capacity select has nothing to offer, or `null` when it does. An
 * empty set and a set with no room are the same dead end for whoever is looking
 * at it, so both are answered in one place: the view replaces the select with
 * the reason and the `Guardar` stays closed.
 */
export function getModalityScheduleCapacityDeadEndMessage(
  scheduleCapacity: ChoreographyModalityResolution["scheduleCapacity"],
) {
  if (scheduleCapacity.status === "none") {
    return noModalityScheduleCapacityMessage;
  }

  // Occupancy is all that is read, so the locked capacity —which carries no
  // label— answers the same question as a select whose every option is full.
  const options: readonly Pick<ScheduleCapacitySelectOption, "isFull">[] =
    scheduleCapacity.options;

  return isEveryScheduleCapacityOptionFull(options)
    ? everyModalityScheduleCapacityFullMessage
    : null;
}

/**
 * Every modality of the event, with the assigned one included rather than
 * excluded: re-selecting it is a successful no-op, and a modality that lost
 * its schedule has to stay visibly selected instead of disappearing.
 *
 * `disabled` marks only the structural dead end —no schedule of the event
 * accepts that modality—, never a full capacity: occupancy is a snapshot that
 * races and is resolved at the capacity step.
 */
export function getModalitySelectOptions(
  options: readonly ChoreographyModalityOption[],
) {
  return options.map((option) => ({
    disabled: !option.hasCompatibleScheduleCapacity,
    label: option.hasCompatibleScheduleCapacity
      ? option.name
      : `${option.name}${noCompatibleScheduleOptionSuffix}`,
    value: option.id,
  }));
}

/**
 * Each candidate modality is queried once, and going back to the assigned one
 * fires no request: its resolution is the one already persisted.
 */
export function shouldResolveModalitySelection({
  canCorrectModality,
  persistedModalityId,
  resolvedModalityId,
  selectedModalityId,
  submittedModalityId,
}: {
  canCorrectModality: boolean;
  persistedModalityId: string;
  resolvedModalityId: string;
  selectedModalityId: string;
  submittedModalityId: string | null;
}) {
  if (
    !canCorrectModality ||
    selectedModalityId.length === 0 ||
    selectedModalityId === persistedModalityId
  ) {
    return false;
  }

  return (
    selectedModalityId !== resolvedModalityId &&
    selectedModalityId !== submittedModalityId
  );
}

/**
 * The three dependent fields, filled or cleared from the resolution.
 *
 * The submodality is never carried over: `choreography.submodality_id` has a
 * plain FK to `submodality` and no constraint ties it to the modality, so
 * keeping it would leave the choreography pointing at a submodality of another
 * modality with nothing noticing.
 */
export function getResolvedModalityFieldState({
  categoryId,
  experienceLevelId,
  resolution,
  watchedScheduleCapacityId,
}: {
  categoryId: string | null;
  experienceLevelId: string | null;
  resolution: ChoreographyModalityResolution;
  watchedScheduleCapacityId: string;
}): ResolvedModalityFieldState {
  const keepsStoredLevel =
    resolution.experienceLevel.required &&
    experienceLevelId !== null &&
    resolution.category?.id === categoryId &&
    resolution.experienceLevel.options.some(
      (option) => option.id === experienceLevelId,
    );

  return {
    nextExperienceLevelId: keepsStoredLevel ? (experienceLevelId ?? "") : "",
    nextScheduleCapacityId: getNextScheduleCapacityId({
      resolution,
      watchedScheduleCapacityId,
    }),
    nextSubmodalityId: "",
  };
}

/**
 * Every field the resolution leaves to be chosen holds the save until it is
 * answered, the capacity included: the roster form next door already does that, and
 * both now share one `Guardar`, so a required field that disables the button in
 * one form and not in the other would make the same button mean two things.
 */
export function canSubmitModalityCorrection(input: CanSubmitModalityInput) {
  if (
    !input.canCorrectModality ||
    input.isResolving ||
    input.isSubmitting ||
    input.selectedModalityId === input.persistedModalityId
  ) {
    return false;
  }

  const resolution = input.resolution;

  if (!resolution || input.resolvedModalityId !== input.selectedModalityId) {
    return false;
  }

  // With no eligible capacity there is no possible correction: the select has
  // already been replaced by the reason, so leaving the button live would ask
  // for a field that is not there. Same rule the view renders, read once.
  if (
    getModalityScheduleCapacityDeadEndMessage(resolution.scheduleCapacity) !==
    null
  ) {
    return false;
  }

  // Only `multiple` leaves a capacity to choose: `auto` arrives preselected and
  // `none` was already turned away above.
  if (
    resolution.scheduleCapacity.status === "multiple" &&
    input.watchedScheduleCapacityId === ""
  ) {
    return false;
  }

  if (resolution.submodality.required && input.watchedSubmodalityId === "") {
    return false;
  }

  return !(
    resolution.experienceLevel.required && input.watchedExperienceLevelId === ""
  );
}

function getNextScheduleCapacityId({
  resolution,
  watchedScheduleCapacityId,
}: {
  resolution: ChoreographyModalityResolution;
  watchedScheduleCapacityId: string;
}) {
  const options = resolution.scheduleCapacity.options;

  if (resolution.scheduleCapacity.status === "auto") {
    return options[0]?.id ?? "";
  }

  return options.some((option) => option.id === watchedScheduleCapacityId)
    ? watchedScheduleCapacityId
    : "";
}

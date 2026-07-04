import type {
  ChoreographyEditValues,
  ChoreographyRosterEditorActionData,
  ChoreographyRosterEditorLoaderData,
  DancerResolutionState,
} from "@/features/portal/choreographies/detail/roster-editor.shared";
import type { ResolveChoreographyDancersResult } from "@/lib/portal/choreography-roster.server";

type ChoreographySummary = ChoreographyRosterEditorLoaderData["choreography"];

export type ScheduleResolution =
  | Extract<
      ResolveChoreographyDancersResult,
      { ok: true }
    >["resolution"]["schedule"]
  | null;

type CanSubmitChoreographyEditInput = {
  canEditDancers: boolean;
  canEditMusic: boolean;
  canEditProfessors: boolean;
  dancerSelectionKey: string;
  derivedResolution: DancerResolutionState;
  hasProfessorsChanged: boolean;
  hasMusicChanged: boolean;
  hasRosterChanged: boolean;
  isResolving: boolean;
  isSubmitting: boolean;
  musicHasValidationError: boolean;
  resolution: ResolveChoreographyDancersResult | null;
  resolvedSelectionKey: string;
  scheduleResolution: ScheduleResolution;
  watchedDancerIds: string[];
  watchedExperienceLevelId: string;
  watchedScheduleCapacityId: string;
};

export function buildChoreographyEditDefaultValues({
  actionData,
  choreography,
  selectedDancerIds,
  selectedProfessorIds,
}: {
  actionData: ChoreographyRosterEditorActionData;
  choreography: ChoreographySummary;
  selectedDancerIds: string[];
  selectedProfessorIds: string[];
}): ChoreographyEditValues {
  return {
    dancerIds: selectedDancerIds,
    professorIds: selectedProfessorIds,
    experienceLevelId:
      actionData?.selectedExperienceLevelId ??
      choreography.experienceLevelId ??
      "",
    musicStorageKey:
      actionData?.selectedMusicStorageKey ?? choreography.musicStorageKey ?? "",
    scheduleCapacityId:
      actionData?.selectedScheduleCapacityId ??
      choreography.scheduleCapacityId ??
      "",
  };
}

export function canSubmitChoreographyEdit(
  input: CanSubmitChoreographyEditInput,
) {
  if (!hasAnyChoreographyEditChange(input)) {
    return false;
  }

  if (input.isResolving || input.isSubmitting) {
    return false;
  }

  if (!canSubmitChangedNonRosterFields(input)) {
    return false;
  }

  return input.hasRosterChanged ? canSubmitRosterChange(input) : true;
}

function hasAnyChoreographyEditChange(input: CanSubmitChoreographyEditInput) {
  return (
    input.hasRosterChanged ||
    input.hasProfessorsChanged ||
    input.hasMusicChanged
  );
}

function canSubmitChangedNonRosterFields(
  input: CanSubmitChoreographyEditInput,
) {
  if (input.hasProfessorsChanged && !input.canEditProfessors) {
    return false;
  }

  if (
    input.hasMusicChanged &&
    (!input.canEditMusic || input.musicHasValidationError)
  ) {
    return false;
  }

  return true;
}

function canSubmitRosterChange(input: CanSubmitChoreographyEditInput) {
  if (!hasResolvedCurrentRosterSelection(input)) {
    return false;
  }

  if (!hasValidRosterScheduleSelection(input)) {
    return false;
  }

  return hasValidRosterExperienceLevelSelection(input);
}

function hasResolvedCurrentRosterSelection(
  input: CanSubmitChoreographyEditInput,
) {
  return (
    input.canEditDancers &&
    input.watchedDancerIds.length > 0 &&
    input.dancerSelectionKey === input.resolvedSelectionKey &&
    input.resolution?.ok === true &&
    input.scheduleResolution?.status !== "none"
  );
}

function hasValidRosterScheduleSelection(
  input: CanSubmitChoreographyEditInput,
) {
  return (
    input.scheduleResolution?.status !== "multiple" ||
    input.watchedScheduleCapacityId.length > 0
  );
}

function hasValidRosterExperienceLevelSelection(
  input: CanSubmitChoreographyEditInput,
) {
  return (
    !input.derivedResolution.experienceLevelRequired ||
    input.watchedExperienceLevelId.length > 0
  );
}

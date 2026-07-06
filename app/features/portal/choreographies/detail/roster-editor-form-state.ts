import type {
  ChoreographyEditValues,
  ChoreographyRosterEditorActionData,
  ChoreographyRosterEditorLoaderData,
  DancerResolutionState,
} from "@/features/portal/choreographies/detail/roster-editor.shared";
import { formatScheduleOptionDateTime } from "@/features/portal/choreographies/detail/roster-editor-options";
import type { ResolveChoreographyDancersResult } from "@/lib/portal/choreography-roster.server";

type ChoreographySummary = ChoreographyRosterEditorLoaderData["choreography"];

export type ScheduleResolution =
  | Extract<
      ResolveChoreographyDancersResult,
      { ok: true }
    >["resolution"]["schedule"]
  | null;

export type ChoreographyEditPermissions = {
  canEditDancers: boolean;
  canEditMusic: boolean;
  canEditProfessors: boolean;
};

export type ReadonlyChoreographyLabels = {
  readonlyExperienceLevelName: string;
  readonlyScheduleLabel: string;
};

export type ResolvedRosterFieldState = {
  nextDerivedResolution: DancerResolutionState;
  nextScheduleCapacityId: string;
  scheduleError: string | null;
  shouldResetExperienceLevel: boolean;
  shouldClearScheduleError: boolean;
};

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

export function getPersistedDancerResolutionState(input: {
  experienceLevelId: ChoreographyRosterEditorLoaderData["choreography"]["experienceLevelId"];
  experienceLevelName: ChoreographyRosterEditorLoaderData["choreography"]["experienceLevelName"];
  operationalStatus: ChoreographyRosterEditorLoaderData["choreography"]["operationalStatus"];
  groupType: ChoreographyRosterEditorLoaderData["choreography"]["groupType"];
  categoryId: ChoreographyRosterEditorLoaderData["choreography"]["categoryId"];
  categoryName: ChoreographyRosterEditorLoaderData["choreography"]["categoryName"];
}) {
  return {
    groupType: input.groupType,
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    categoryCalculationMode: null,
    categoryAgeBasis: null,
    experienceLevelRequired:
      input.experienceLevelId !== null ||
      input.operationalStatus.pendingItems.includes("experienceLevel"),
    experienceLevelOptions:
      input.experienceLevelId && input.experienceLevelName
        ? [
            {
              id: input.experienceLevelId,
              name: input.experienceLevelName,
            },
          ]
        : [],
  } satisfies DancerResolutionState;
}

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

export function getChoreographyEditPermissions({
  choreography,
  loaderData,
}: {
  choreography: ChoreographySummary;
  loaderData: ChoreographyRosterEditorLoaderData;
}): ChoreographyEditPermissions {
  const canEditPresentationDetails =
    !loaderData.eventContext.isReadOnly && !choreography.hasPresentation;

  return {
    canEditDancers: loaderData.dancerEditingEligibility.canEdit,
    canEditMusic: canEditPresentationDetails,
    canEditProfessors: canEditPresentationDetails,
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

export function hasResolvedRosterSelectionChange({
  dancerSelectionKey,
  hasRosterChanged,
  resolution,
  resolvedSelectionKey,
}: {
  dancerSelectionKey: string;
  hasRosterChanged: boolean;
  resolution: ResolveChoreographyDancersResult | null;
  resolvedSelectionKey: string;
}) {
  return (
    hasRosterChanged &&
    dancerSelectionKey === resolvedSelectionKey &&
    resolution?.ok === true
  );
}

export function getScheduleResolution(
  resolution: ResolveChoreographyDancersResult | null,
): ScheduleResolution {
  if (!resolution?.ok) {
    return null;
  }

  return resolution.resolution.schedule;
}

export function getReadonlyChoreographyLabels({
  choreography,
  hasResolvedRosterChange,
  scheduleResolution,
}: {
  choreography: ChoreographySummary;
  hasResolvedRosterChange: boolean;
  scheduleResolution: ScheduleResolution;
}): ReadonlyChoreographyLabels {
  return {
    readonlyExperienceLevelName: hasResolvedRosterChange
      ? ""
      : (choreography.experienceLevelName ?? ""),
    readonlyScheduleLabel: getReadonlyScheduleLabel({
      choreography,
      hasResolvedRosterChange,
      scheduleResolution,
    }),
  };
}

export function shouldResolveRosterSelection({
  canEditDancers,
  dancerSelectionKey,
  hasRosterChanged,
  resolvedSelectionKey,
  submittedSelectionKey,
  watchedDancerIds,
}: {
  canEditDancers: boolean;
  dancerSelectionKey: string;
  hasRosterChanged: boolean;
  resolvedSelectionKey: string;
  submittedSelectionKey: string | null;
  watchedDancerIds: string[];
}) {
  if (!hasRosterChanged) {
    return false;
  }

  if (!canEditDancers || watchedDancerIds.length === 0) {
    return false;
  }

  return (
    dancerSelectionKey !== resolvedSelectionKey &&
    dancerSelectionKey !== submittedSelectionKey
  );
}

function mapResolvedDancerResolutionState(
  result: Extract<ResolveChoreographyDancersResult, { ok: true }>,
) {
  return {
    groupType: result.resolution.groupType,
    categoryId: result.resolution.categoryId,
    categoryName: result.resolution.categoryName,
    categoryCalculationMode: result.resolution.categoryCalculationMode ?? null,
    categoryAgeBasis: result.resolution.categoryAgeBasis ?? null,
    experienceLevelRequired: result.resolution.experienceLevel.required,
    experienceLevelOptions: result.resolution.experienceLevel.options,
  } satisfies DancerResolutionState;
}

export function getResolvedRosterFieldState({
  currentCategoryId,
  result,
  watchedScheduleCapacityId,
}: {
  currentCategoryId: ChoreographySummary["categoryId"];
  result: Extract<ResolveChoreographyDancersResult, { ok: true }>;
  watchedScheduleCapacityId: string;
}): ResolvedRosterFieldState {
  const nextDerivedResolution = mapResolvedDancerResolutionState(result);
  const categoryChanged =
    currentCategoryId !== nextDerivedResolution.categoryId;
  const nextSchedule = result.resolution.schedule;

  return {
    nextDerivedResolution,
    nextScheduleCapacityId: getNextScheduleCapacityId({
      nextSchedule,
      watchedScheduleCapacityId,
    }),
    scheduleError: nextSchedule.status === "none" ? nextSchedule.error : null,
    shouldResetExperienceLevel:
      !nextDerivedResolution.experienceLevelRequired || categoryChanged,
    shouldClearScheduleError:
      nextSchedule.status === "keep-current" || nextSchedule.status === "auto",
  };
}

function getReadonlyScheduleLabel({
  choreography,
  hasResolvedRosterChange,
  scheduleResolution,
}: {
  choreography: ChoreographySummary;
  hasResolvedRosterChange: boolean;
  scheduleResolution: ScheduleResolution;
}) {
  if (hasResolvedRosterChange && scheduleResolution?.status === "auto") {
    return formatScheduleOptionDateTime(scheduleResolution.options[0]);
  }

  return choreography.scheduleLabel;
}

function getNextScheduleCapacityId({
  nextSchedule,
  watchedScheduleCapacityId,
}: {
  nextSchedule: NonNullable<ScheduleResolution>;
  watchedScheduleCapacityId: string;
}) {
  if (
    nextSchedule.status === "keep-current" ||
    nextSchedule.status === "auto"
  ) {
    return nextSchedule.selectedScheduleCapacityId;
  }

  if (nextSchedule.status === "multiple") {
    return nextSchedule.options.some(
      (option) => option.id === watchedScheduleCapacityId,
    )
      ? watchedScheduleCapacityId
      : "";
  }

  return "";
}

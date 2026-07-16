import type { ResolveChoreographyDancersResult } from "@/lib/choreographies/choreography-roster.server";

import type { AdministrativeChoreographyDetail } from "./server";

export type AdministrativeScheduleResolution =
  | Extract<
      ResolveChoreographyDancersResult,
      { ok: true }
    >["resolution"]["schedule"]
  | null;

export type AdministrativeRosterResolutionState = {
  categoryId: string | null;
  categoryName: string | null;
  experienceLevelOptions: Array<{ id: string; name: string }>;
  experienceLevelRequired: boolean;
  groupType: AdministrativeChoreographyDetail["groupType"];
};

export type AdministrativeResolvedRosterFieldState = {
  nextDerivedResolution: AdministrativeRosterResolutionState;
  nextScheduleCapacityId: string;
  shouldResetExperienceLevel: boolean;
};

type CanSubmitInput = {
  canEditRoster: boolean;
  derivedResolution: AdministrativeRosterResolutionState;
  hasNameChanged: boolean;
  hasProfessorsChanged: boolean;
  hasRosterChanged: boolean;
  isResolving: boolean;
  isSubmitting: boolean;
  resolution: ResolveChoreographyDancersResult | null;
  resolvedSelectionKey: string;
  scheduleResolution: AdministrativeScheduleResolution;
  selectionKey: string;
  watchedDancerIds: string[];
  watchedExperienceLevelId: string;
  watchedScheduleCapacityId: string;
};

/**
 * Estado de resolución que ya está persistido en la coreografía. Es el punto de
 * partida antes de que el admin toque el roster: sin cambios no se le pide nada
 * al server, así que los campos derivados muestran lo guardado.
 */
export function getPersistedRosterResolutionState(
  choreography: AdministrativeChoreographyDetail,
): AdministrativeRosterResolutionState {
  return {
    categoryId: choreography.categoryId,
    categoryName: choreography.categoryName,
    experienceLevelOptions:
      choreography.experienceLevelId && choreography.experienceLevelName
        ? [
            {
              id: choreography.experienceLevelId,
              name: choreography.experienceLevelName,
            },
          ]
        : [],
    experienceLevelRequired: choreography.experienceLevelId !== null,
    groupType: choreography.groupType,
  };
}

export function getSelectionKey(ids: string[]) {
  return [...ids].sort().join("|");
}

export function getScheduleResolution(
  resolution: ResolveChoreographyDancersResult | null,
): AdministrativeScheduleResolution {
  if (!resolution?.ok) {
    return null;
  }

  return resolution.resolution.schedule;
}

/**
 * Solo mostramos los campos derivados en modo edición cuando el server ya
 * respondió por la selección actual. Mientras tanto siguen read-only con el
 * valor persistido, para no ofrecer opciones que la re-resolución puede cambiar.
 */
export function hasResolvedRosterSelectionChange({
  hasRosterChanged,
  resolution,
  resolvedSelectionKey,
  selectionKey,
}: {
  hasRosterChanged: boolean;
  resolution: ResolveChoreographyDancersResult | null;
  resolvedSelectionKey: string;
  selectionKey: string;
}) {
  return (
    hasRosterChanged &&
    selectionKey === resolvedSelectionKey &&
    resolution?.ok === true
  );
}

export function shouldResolveRosterSelection({
  canEditRoster,
  hasRosterChanged,
  resolvedSelectionKey,
  selectionKey,
  submittedSelectionKey,
  watchedDancerIds,
}: {
  canEditRoster: boolean;
  hasRosterChanged: boolean;
  resolvedSelectionKey: string;
  selectionKey: string;
  submittedSelectionKey: string | null;
  watchedDancerIds: string[];
}) {
  if (!hasRosterChanged || !canEditRoster || watchedDancerIds.length === 0) {
    return false;
  }

  return (
    selectionKey !== resolvedSelectionKey &&
    selectionKey !== submittedSelectionKey
  );
}

export function getResolvedRosterFieldState({
  currentCategoryId,
  result,
  watchedScheduleCapacityId,
}: {
  currentCategoryId: string | null;
  result: Extract<ResolveChoreographyDancersResult, { ok: true }>;
  watchedScheduleCapacityId: string;
}): AdministrativeResolvedRosterFieldState {
  const nextDerivedResolution: AdministrativeRosterResolutionState = {
    categoryId: result.resolution.categoryId,
    categoryName: result.resolution.categoryName,
    experienceLevelOptions: result.resolution.experienceLevel.options,
    experienceLevelRequired: result.resolution.experienceLevel.required,
    groupType: result.resolution.groupType,
  };

  return {
    nextDerivedResolution,
    nextScheduleCapacityId: getNextScheduleCapacityId({
      nextSchedule: result.resolution.schedule,
      watchedScheduleCapacityId,
    }),
    shouldResetExperienceLevel:
      !nextDerivedResolution.experienceLevelRequired ||
      currentCategoryId !== nextDerivedResolution.categoryId,
  };
}

/**
 * `categoryId: null` con `ok: true` es cómo el server expresa "no hay categoría
 * compatible con este roster". No es un error de resolución, así que bloquear el
 * guardado es responsabilidad del cliente.
 */
export function hasNoCompatibleCategory({
  derivedResolution,
  hasResolvedRosterChange,
}: {
  derivedResolution: AdministrativeRosterResolutionState;
  hasResolvedRosterChange: boolean;
}) {
  return hasResolvedRosterChange && derivedResolution.categoryId === null;
}

export function canSubmitAdministrativeChoreographyEdit(input: CanSubmitInput) {
  if (
    !input.hasNameChanged &&
    !input.hasRosterChanged &&
    !input.hasProfessorsChanged
  ) {
    return false;
  }

  if (input.isResolving || input.isSubmitting) {
    return false;
  }

  if (
    (input.hasRosterChanged || input.hasProfessorsChanged) &&
    !input.canEditRoster
  ) {
    return false;
  }

  return input.hasRosterChanged ? canSubmitRosterChange(input) : true;
}

function canSubmitRosterChange(input: CanSubmitInput) {
  const isResolved =
    input.watchedDancerIds.length > 0 &&
    input.selectionKey === input.resolvedSelectionKey &&
    input.resolution?.ok === true &&
    input.scheduleResolution?.status !== "none";

  if (!isResolved || input.derivedResolution.categoryId === null) {
    return false;
  }

  const hasSchedule =
    input.scheduleResolution?.status !== "multiple" ||
    input.watchedScheduleCapacityId.length > 0;
  const hasExperienceLevel =
    !input.derivedResolution.experienceLevelRequired ||
    input.watchedExperienceLevelId.length > 0;

  return hasSchedule && hasExperienceLevel;
}

function getNextScheduleCapacityId({
  nextSchedule,
  watchedScheduleCapacityId,
}: {
  nextSchedule: NonNullable<AdministrativeScheduleResolution>;
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

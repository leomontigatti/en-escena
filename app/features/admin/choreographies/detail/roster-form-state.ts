import type { ResolveChoreographyDancersResult } from "@/lib/choreographies/choreography-roster.server";

import type { ChoreographyDetail } from "./server";

export type ScheduleResolution =
  | Extract<
      ResolveChoreographyDancersResult,
      { ok: true }
    >["resolution"]["schedule"]
  | null;

export type RosterResolutionState = {
  categoryId: string | null;
  categoryName: string | null;
  experienceLevelOptions: Array<{ id: string; name: string }>;
  experienceLevelRequired: boolean;
  groupType: ChoreographyDetail["groupType"];
};

export type ResolvedRosterFieldState = {
  nextDerivedResolution: RosterResolutionState;
  nextScheduleCapacityId: string;
  shouldResetExperienceLevel: boolean;
};

type CanSubmitInput = {
  canEditRoster: boolean;
  derivedResolution: RosterResolutionState;
  hasNameChanged: boolean;
  hasProfessorsChanged: boolean;
  hasRosterChanged: boolean;
  isResolving: boolean;
  isSubmitting: boolean;
  resolution: ResolveChoreographyDancersResult | null;
  resolvedSelectionKey: string;
  scheduleResolution: ScheduleResolution;
  selectionKey: string;
  /**
   * `getExperienceLevelSlotState().showRosterSelect`. The gate's condition is
   * exactly the field's: require a level in the roster form only when that form
   * offers one. Reading a bare `experienceLevelRequired` left saving blocked
   * with no field to unblock it with, whenever the server's retention keeps the
   * saved level.
   */
  showRosterExperienceLevelSelect: boolean;
  watchedDancerIds: string[];
  watchedExperienceLevelId: string;
  watchedScheduleCapacityId: string;
};

/**
 * The resolution state already persisted on the choreography. It is the
 * starting point before the admin touches the roster: with no changes nothing is
 * asked of the server, so the derived fields show what is saved.
 */
export function getPersistedRosterResolutionState(
  choreography: ChoreographyDetail,
): RosterResolutionState {
  return {
    categoryId: choreography.categoryId,
    categoryName: choreography.categoryName,
    // Whether the level is needed is a property of the category, not of the saved
    // value: deriving it from `experienceLevelId !== null` made a choreography
    // that is missing the level claim it does not need one.
    experienceLevelOptions: choreography.experienceLevelOptions,
    experienceLevelRequired: choreography.requiresExperienceLevel,
    groupType: choreography.groupType,
  };
}

export function getSelectionKey(ids: string[]) {
  return [...ids].sort().join("|");
}

export function getScheduleResolution(
  resolution: ResolveChoreographyDancersResult | null,
): ScheduleResolution {
  if (!resolution?.ok) {
    return null;
  }

  return resolution.resolution.schedule;
}

/**
 * The derived fields are only shown in edit mode once the server has answered
 * for the current selection. Until then they stay read-only with the persisted
 * value, so as not to offer options that re-resolution may change.
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
}): ResolvedRosterFieldState {
  const nextDerivedResolution: RosterResolutionState = {
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
 * `categoryId: null` with `ok: true` is how the server says "there is no
 * category compatible with this roster". It is not a resolution error, so
 * blocking the save is the client's responsibility.
 */
export function hasNoCompatibleCategory({
  derivedResolution,
  hasResolvedRosterChange,
}: {
  derivedResolution: RosterResolutionState;
  hasResolvedRosterChange: boolean;
}) {
  return hasResolvedRosterChange && derivedResolution.categoryId === null;
}

/**
 * There is a single "Cronograma" slot and the roster select takes precedence: a
 * group type change clears the capacity, and its replacement is chosen together with
 * the roster confirmation rather than separately. Only once no roster change is
 * pending does the standalone reassignment claim the slot.
 *
 * Returns the options rather than a boolean so the decision and the narrowing
 * it implies live in one place: only the "multiple" resolution carries labelled
 * options, and that is exactly the variant the shared select builder needs.
 */
export function getRosterScheduleSelectOptions({
  hasResolvedRosterChange,
  scheduleResolution,
}: {
  hasResolvedRosterChange: boolean;
  scheduleResolution: ScheduleResolution;
}) {
  if (!hasResolvedRosterChange || scheduleResolution?.status !== "multiple") {
    return null;
  }

  return scheduleResolution.options;
}

/**
 * The dancers this submit takes off the roster whose inscription holds
 * evidence: allocated money or a comprobante line. Those are not deleted, they
 * are withdrawn, and the dialog spells that consequence out only when the list
 * is not empty. Without evidence there is nothing to tell: the removal is a
 * delete and the dialog stays as it was.
 *
 * Returns the id alongside the name because two dancers sharing a name in the
 * same choreography are possible, and the name alone does not identify the row.
 */
export function getWithdrawnDancers({
  dancers,
  watchedDancerIds,
}: {
  dancers: ChoreographyDetail["dancers"];
  watchedDancerIds: string[];
}) {
  const keptDancerIds = new Set(watchedDancerIds);

  return dancers
    .filter((dancer) => dancer.hasEvidence && !keptDancerIds.has(dancer.id))
    .map((dancer) => ({
      id: dancer.id,
      name: `${dancer.firstName} ${dancer.lastName}`,
    }));
}

/**
 * There is a single "Nivel de experiencia" slot, and its precedence is the exact
 * mirror of the server's retention (`resolveSelectedExperienceLevelId`), which
 * keeps the saved level — and ignores whatever the form sends — when the
 * category stayed the same and the value is still allowed.
 *
 * While that retention applies, the level does not travel with the roster: the
 * slot belongs to the standalone reassignment, which writes against the already
 * persisted category. When it does not apply, saving the roster needs a new
 * level — the category is not persisted yet, so choosing it separately would
 * write it against one that does not exist — and the field returns to the roster
 * form, required.
 *
 * Tying them together like this is what stops the same field from honouring the
 * choice in one state and silently discarding it in the other: every rendered
 * select writes.
 *
 * It stays read-only when the resolved category declares no levels, because
 * `update-roster` is going to null it out on save, and offering a select over a
 * value that saving erases invites choosing something that gets discarded.
 */
export function getExperienceLevelSlotState({
  choreography,
  derivedResolution,
  hasResolvedRosterChange,
}: {
  choreography: ChoreographyDetail;
  derivedResolution: RosterResolutionState;
  hasResolvedRosterChange: boolean;
}): {
  experienceLevelId: string;
  requiresExperienceLevel: boolean;
  showRosterSelect: boolean;
} {
  if (!hasResolvedRosterChange) {
    return {
      experienceLevelId: choreography.experienceLevelId ?? "",
      requiresExperienceLevel: choreography.requiresExperienceLevel,
      showRosterSelect: false,
    };
  }

  const keepsStoredLevel =
    derivedResolution.categoryId === choreography.categoryId &&
    choreography.experienceLevelId !== null &&
    derivedResolution.experienceLevelOptions.some(
      (option) => option.id === choreography.experienceLevelId,
    );

  if (keepsStoredLevel) {
    return {
      experienceLevelId: choreography.experienceLevelId ?? "",
      requiresExperienceLevel: derivedResolution.experienceLevelRequired,
      showRosterSelect: false,
    };
  }

  return {
    experienceLevelId: "",
    requiresExperienceLevel: derivedResolution.experienceLevelRequired,
    showRosterSelect: derivedResolution.experienceLevelRequired,
  };
}

export function canSubmitChoreographyEdit(input: CanSubmitInput) {
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
  // When the slot ended up on the standalone reassignment the level does not
  // travel with the roster: the server keeps the saved one and the form has
  // nowhere to choose it, so requiring it here would block saving with no way out.
  const hasExperienceLevel =
    !input.showRosterExperienceLevelSelect ||
    input.watchedExperienceLevelId.length > 0;

  return hasSchedule && hasExperienceLevel;
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

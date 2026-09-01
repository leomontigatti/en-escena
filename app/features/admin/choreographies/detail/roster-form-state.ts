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
   * `getExperienceLevelSlotState().showRosterSelect`. La condición del gate es
   * exactamente la del campo: exigir un nivel en el form del roster solo cuando
   * ese form lo ofrece. Leer `experienceLevelRequired` a secas dejaba el
   * guardado bloqueado sin campo con el que desbloquearlo cuando la retención
   * del server conserva el nivel guardado.
   */
  showRosterExperienceLevelSelect: boolean;
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
  choreography: ChoreographyDetail,
): RosterResolutionState {
  return {
    categoryId: choreography.categoryId,
    categoryName: choreography.categoryName,
    // Que el nivel haga falta es una propiedad de la categoría, no del valor
    // guardado: derivarlo de `experienceLevelId !== null` hacía que una
    // coreografía a la que le falta el nivel afirmara que no lo necesita.
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
 * `categoryId: null` con `ok: true` es cómo el server expresa "no hay categoría
 * compatible con este roster". No es un error de resolución, así que bloquear el
 * guardado es responsabilidad del cliente.
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
 * El slot "Cronograma" es uno solo y el select del roster tiene prioridad: un
 * cambio de tipo de grupo limpia el cupo, y el reemplazo se elige junto con la
 * confirmación del roster, no por separado. Recién cuando no hay cambio de
 * roster pendiente entra la reasignación autónoma.
 */
export function shouldRenderRosterScheduleSelect({
  hasResolvedRosterChange,
  scheduleResolution,
}: {
  hasResolvedRosterChange: boolean;
  scheduleResolution: ScheduleResolution;
}) {
  return hasResolvedRosterChange && scheduleResolution?.status === "multiple";
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
 * El slot "Nivel de experiencia" es uno solo, y la precedencia es el espejo
 * exacto de la retención del server (`resolveSelectedExperienceLevelId`), que
 * conserva el nivel guardado —e ignora el que mande el form— cuando la
 * categoría se mantuvo y el valor sigue permitido.
 *
 * Mientras esa retención aplique, el nivel no viaja con el roster: el slot es
 * de la reasignación autónoma, que escribe contra la categoría ya persistida.
 * Cuando no aplica, el guardado del roster necesita un nivel nuevo —la
 * categoría todavía no está persistida, así que elegirlo por separado lo
 * escribiría contra una que no existe— y el campo vuelve al form del roster,
 * requerido.
 *
 * Atarlas así es lo que evita que el mismo campo honre la elección en un estado
 * y la descarte en silencio en el otro: todo select renderizado escribe.
 *
 * Queda de solo lectura cuando la categoría resuelta no declara niveles, porque
 * `update-roster` lo va a nulear al guardar y ofrecer un select sobre un valor
 * que el guardado borra invita a elegir algo que se descarta.
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
  // Cuando el slot quedó en la reasignación autónoma el nivel no viaja con el
  // roster: el server conserva el guardado y el form no tiene dónde elegirlo,
  // así que exigirlo acá bloquearía el guardado sin salida.
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

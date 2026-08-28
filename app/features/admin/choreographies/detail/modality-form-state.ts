import { isEveryScheduleCapacityOptionFull } from "@/lib/choreographies/schedule-capacity-options";

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
 * El motivo viaja en la opción, no en un mensaje aparte: una modalidad que
 * ningún cronograma acepta es un callejón sin salida estructural, y quien la ve
 * gris tiene que saber por qué sin tener que buscarlo.
 */
const noCompatibleScheduleOptionSuffix = " (sin cronograma compatible)";

/**
 * Un select donde ningún cupo compatible tiene lugar es un callejón sin salida
 * silencioso, igual que en el alta del portal: se reemplaza por el motivo.
 */
export const everyModalityScheduleCapacityFullMessage =
  "Los cronogramas compatibles con esta modalidad ya no tienen lugar. Elegí otra modalidad para corregirla.";

/**
 * Todas las modalidades del evento, con la asignada incluida en lugar de
 * excluida: reelegirla es un no-op exitoso, y una modalidad que perdió su
 * cronograma tiene que seguir viéndose seleccionada en vez de desaparecer.
 *
 * `disabled` marca únicamente el callejón sin salida estructural —ningún
 * cronograma del evento acepta esa modalidad—, nunca un cupo lleno: la ocupación
 * es una foto que corre carrera y se resuelve en el paso del cupo.
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
 * Cada modalidad candidata se consulta una sola vez, y volver a la asignada no
 * dispara pedido: su resolución es la que ya está persistida.
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
 * Los tres campos dependientes, rellenados o limpiados desde la resolución.
 *
 * La submodalidad nunca se arrastra: `choreography.submodality_id` tiene una FK
 * suelta a `submodality` y ninguna restricción la ata a la modalidad, así que
 * conservarla dejaría a la coreografía apuntando a una submodalidad de otra
 * modalidad sin que nada lo note.
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
 * Con un solo cupo compatible no hay nada que elegir: queda preseleccionado y de
 * solo lectura, igual que el estado `auto` del alta.
 */
export function isModalityScheduleCapacityLocked(
  resolution: ChoreographyModalityResolution,
) {
  return resolution.scheduleCapacity.status === "auto";
}

/**
 * El cupo vacío no entra acá: el submit lo levanta como error de campo
 * obligatorio sobre el select, que es donde el admin lo resuelve. Apagar el
 * botón dejaría un formulario que no explica qué le falta.
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

  // Sin cupo elegible no hay corrección posible: el select ya fue reemplazado
  // por el motivo, así que dejar el botón vivo pediría un campo que no está.
  if (
    resolution.scheduleCapacity.status === "none" ||
    isEveryScheduleCapacityOptionFull(resolution.scheduleCapacity.options)
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

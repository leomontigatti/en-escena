import type { FieldErrors } from "@/lib/shared/form-validation";
import { notificationToasts } from "@/lib/shared/notification-toasts";

export const renameChoreographyIntent = "rename-choreography";
export const deleteChoreographyIntent = "delete-choreography";
export const resolveChoreographyRosterIntent = "resolve-roster";
export const updateChoreographyRosterIntent = "update-roster";
export const updateChoreographySubmodalityIntent = "update-submodality";
export const updateChoreographyScheduleCapacityIntent =
  "update-schedule-capacity";
export const updateChoreographyExperienceLevelIntent =
  "update-experience-level";

/**
 * El select autónomo de cronograma vive dentro del `form` del roster, que ya
 * registra `scheduleCapacityId`. Un nombre propio evita que los dos campos se
 * pisen en el DOM y deja claro cuál de los dos está renderizado.
 */
export const assignedScheduleCapacityFieldName = "assignedScheduleCapacityId";

/**
 * Mismo motivo que el cupo: el `form` del roster ya registra
 * `experienceLevelId`, así que el select autónomo usa un nombre propio para no
 * pisarlo en el DOM.
 */
export const assignedExperienceLevelFieldName = "assignedExperienceLevelId";

/**
 * `resolve-roster` solo consulta cómo quedaría la coreografía con un roster
 * tentativo: no persiste nada. Revalidar tras esa consulta recarga el loader y
 * reinicia el formulario con el roster guardado, pisando la edición en curso.
 */
export function shouldRevalidateChoreographyDetail(input: {
  defaultShouldRevalidate: boolean;
  formData?: FormData;
}) {
  if (input.formData?.get("intent") === resolveChoreographyRosterIntent) {
    return false;
  }

  return input.defaultShouldRevalidate;
}

export const choreographyFieldNames = ["name"] as const;

export type ChoreographyFieldName = (typeof choreographyFieldNames)[number];

export type ChoreographyActionData = {
  fieldErrors?: FieldErrors<ChoreographyFieldName>;
  message: string;
  status: "error";
  values: {
    name: string;
  };
};

/**
 * Los intents de campo suelto (submodalidad, cupo de cronograma) informan sin
 * errores por campo: el select vuelve a su valor guardado y el motivo llega
 * por toast.
 */
export type ChoreographyFieldUpdateErrorData = {
  message: string;
  status: "error";
};

export type ChoreographySuccessData = {
  message: string;
  status: "success";
};

// La edición en el lugar del detalle no redirige: retorna
// `{ status: "success" }`, el loader revalida y la vista dispara el toast
// directo. Ver docs/agents/form-feedback.md.
export function choreographySavedSuccess(): ChoreographySuccessData {
  return {
    message: notificationToasts["coreografia-guardada"].message,
    status: "success",
  };
}

export type ChoreographyViewActionData =
  | ChoreographyActionData
  | ChoreographyFieldUpdateErrorData
  | ChoreographySuccessData;

export type ChoreographyRosterErrorData = {
  fieldErrors?: {
    experienceLevelId?: string;
    scheduleCapacityId?: string;
  };
  message: string;
  section: "dancers" | "professors";
  status: "roster-error";
};

/**
 * La ruta solo reenvía a la vista los resultados con status `error` o
 * `success`. Un status a medida —como el `roster-error` que la sección de
 * roster lee aparte— se descarta en silencio, así que un intent nuevo que
 * quiera que su rechazo se vea tiene que devolver `error`.
 */
export function toChoreographyDetailViewActionData(
  actionData?:
    | ChoreographyRosterErrorData
    | ChoreographyViewActionData
    | Response
    | { intent: string },
): ChoreographyViewActionData | undefined {
  if (!actionData || actionData instanceof Response) {
    return undefined;
  }

  if (!("status" in actionData)) {
    return undefined;
  }

  return actionData.status === "error" || actionData.status === "success"
    ? actionData
    : undefined;
}

export type ChoreographyScheduleCapacityBlockerCode = "frozen-price";

/**
 * Motivo por el que la reasignación del cupo de cronograma está cerrada, con la
 * misma forma que los bloqueos de eliminación: el servidor arma el `code` y la
 * etiqueta que se lee, y la vista solo la enumera en la alerta de la página.
 */
export type ChoreographyScheduleCapacityBlocker = {
  code: ChoreographyScheduleCapacityBlockerCode;
  label: string;
};

/**
 * Las cuatro causas de solo lectura del cupo de cronograma: no ser `admin`,
 * tener presentación, arrastrar un bloqueo del servidor (hoy, la seña
 * congelada) y no tener al menos dos cupos compatibles entre los que elegir.
 */
export function canReassignScheduleCapacity(input: {
  blockers: ChoreographyScheduleCapacityBlocker[];
  canEdit: boolean;
  hasMultipleCompatibleOptions: boolean;
  hasPresentation: boolean;
}) {
  return (
    input.canEdit &&
    !input.hasPresentation &&
    input.blockers.length === 0 &&
    input.hasMultipleCompatibleOptions
  );
}

/**
 * El nivel de experiencia no es clave de precio, así que no arrastra bloqueos
 * del servidor como el cupo: alcanza con las tres causas de solo lectura. La
 * condición de fondo es una sola —que la categoría resuelta declare niveles—,
 * más los dos candados transversales de la coreografía. No hay umbral de
 * cantidad de opciones: con una sola opción el campo sigue abierto, porque es
 * el único modo de resolver un nivel faltante que deja la coreografía
 * incompleta.
 */
export function canReassignExperienceLevel(input: {
  canEdit: boolean;
  hasPresentation: boolean;
  requiresExperienceLevel: boolean;
}) {
  return (
    input.canEdit && !input.hasPresentation && input.requiresExperienceLevel
  );
}

export type ChoreographyDeleteBlockerCode =
  | "comprobantes"
  | "presentation"
  | "scores";

export type ChoreographyDeleteBlocker = {
  code: ChoreographyDeleteBlockerCode;
  label: string;
};

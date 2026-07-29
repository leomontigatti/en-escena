import type { FieldErrors } from "@/lib/shared/form-validation";

export const renameAdministrativeChoreographyIntent = "rename-choreography";
export const deleteAdministrativeChoreographyIntent = "delete-choreography";
export const resolveAdministrativeChoreographyRosterIntent = "resolve-roster";
export const updateAdministrativeChoreographyRosterIntent = "update-roster";
export const updateAdministrativeChoreographySubmodalityIntent =
  "update-submodality";

export const administrativeChoreographyNotFoundMessage =
  "No encontramos esa coreografía.";

/**
 * `resolve-roster` solo consulta cómo quedaría la coreografía con un roster
 * tentativo: no persiste nada. Revalidar tras esa consulta recarga el loader y
 * reinicia el formulario con el roster guardado, pisando la edición en curso.
 */
export function shouldRevalidateAdministrativeChoreographyDetail(input: {
  defaultShouldRevalidate: boolean;
  formData?: FormData;
}) {
  if (
    input.formData?.get("intent") ===
    resolveAdministrativeChoreographyRosterIntent
  ) {
    return false;
  }

  return input.defaultShouldRevalidate;
}

export const administrativeChoreographyFieldNames = ["name"] as const;

export type ChoreographyFieldName =
  (typeof administrativeChoreographyFieldNames)[number];

export type ChoreographyActionData = {
  fieldErrors?: FieldErrors<ChoreographyFieldName>;
  message: string;
  status: "error";
  values: {
    name: string;
  };
};

export type ChoreographySubmodalityErrorData = {
  message: string;
  status: "error";
};

export type ChoreographySuccessData = {
  message: string;
  status: "success";
};

export type ChoreographyViewActionData =
  | ChoreographyActionData
  | ChoreographySubmodalityErrorData
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

export type ChoreographyDeleteBlockerCode =
  | "comprobantes"
  | "presentation"
  | "scores";

export type ChoreographyDeleteBlocker = {
  code: ChoreographyDeleteBlockerCode;
  label: string;
};

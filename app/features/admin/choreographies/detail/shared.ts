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

export type AdministrativeChoreographyFieldName =
  (typeof administrativeChoreographyFieldNames)[number];

export type AdministrativeChoreographyActionData = {
  fieldErrors?: FieldErrors<AdministrativeChoreographyFieldName>;
  message: string;
  status: "error";
  values: {
    name: string;
  };
};

export type AdministrativeChoreographySubmodalityErrorData = {
  message: string;
  status: "error";
};

export type AdministrativeChoreographySuccessData = {
  message: string;
  status: "success";
};

export type AdministrativeChoreographyViewActionData =
  | AdministrativeChoreographyActionData
  | AdministrativeChoreographySubmodalityErrorData
  | AdministrativeChoreographySuccessData;

export type AdministrativeChoreographyRosterErrorData = {
  fieldErrors?: {
    experienceLevelId?: string;
    scheduleCapacityId?: string;
  };
  message: string;
  section: "dancers" | "professors";
  status: "roster-error";
};

export type AdministrativeChoreographyDeleteBlockerCode =
  | "presentation"
  | "scores";

export type AdministrativeChoreographyDeleteBlocker = {
  code: AdministrativeChoreographyDeleteBlockerCode;
  label: string;
};

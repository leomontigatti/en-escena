import type { FieldErrors } from "@/lib/shared/form-validation";

export const renameChoreographyIntent = "rename-choreography";
export const deleteChoreographyIntent = "delete-choreography";
export const resolveChoreographyRosterIntent = "resolve-roster";
export const updateChoreographyRosterIntent = "update-roster";
export const updateChoreographySubmodalityIntent = "update-submodality";

export const choreographyNotFoundMessage = "No encontramos esa coreografía.";

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

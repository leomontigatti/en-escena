import type { FieldErrors } from "@/lib/shared/form-validation";

export const renameAdministrativeChoreographyIntent = "rename-choreography";
export const deleteAdministrativeChoreographyIntent = "delete-choreography";

export const administrativeChoreographyNotFoundMessage =
  "No encontramos esa coreografía.";

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

export type AdministrativeChoreographyDeleteBlockerCode =
  | "invoices"
  | "presentation"
  | "scores";

export type AdministrativeChoreographyDeleteBlocker = {
  code: AdministrativeChoreographyDeleteBlockerCode;
  label: string;
};

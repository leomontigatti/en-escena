import { z } from "zod";

import { isInternalUserRole } from "@/lib/auth/internal-user-roles";
import {
  internalUsernameRuleMessage,
  isValidInternalUsername,
} from "@/lib/auth/internal-username.shared";
import { requiredFieldMessage } from "@/lib/shared/forms";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";

const passwordMinLength = 8;

const requiredTextField = () => z.string().trim().min(1, requiredFieldMessage);

const roleField = z
  .string()
  .trim()
  .min(1, requiredFieldMessage)
  .refine(isInternalUserRole, "Elegí un permiso principal válido.");

export const createInternalUserIntent = "create-internal-user";

export const createInternalUserSchema = z.object({
  name: requiredTextField(),
  internalUsername: requiredTextField().refine(
    isValidInternalUsername,
    internalUsernameRuleMessage,
  ),
  role: roleField,
  password: requiredTextField().refine(
    (value) => value.length >= passwordMinLength,
    `La contraseña debe tener al menos ${passwordMinLength} caracteres.`,
  ),
});

const createInternalUserFieldNames = [
  "name",
  "internalUsername",
  "role",
  "password",
] as const;

export type CreateInternalUserField =
  (typeof createInternalUserFieldNames)[number];
export type CreateInternalUserFieldErrors = Partial<
  Record<CreateInternalUserField, string>
>;
export type CreateInternalUserFormValues = {
  name: string;
  internalUsername: string;
  role: string;
  password: string;
};

export type CreateInternalUserActionData = {
  form: "create";
  status: "error";
  message: string;
  fieldErrors: CreateInternalUserFieldErrors;
  values: CreateInternalUserFormValues;
};

export const defaultCreateInternalUserFormValues: CreateInternalUserFormValues =
  {
    name: "",
    internalUsername: "",
    role: "judge",
    password: "",
  };

export function readCreateInternalUserFormValues(
  formData: FormData,
): CreateInternalUserFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    internalUsername: String(formData.get("internalUsername") ?? ""),
    role: String(formData.get("role") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
}

export function getCreateInternalUserValidationFieldErrors(
  error: z.ZodError<CreateInternalUserFormValues>,
): CreateInternalUserFieldErrors {
  return getFieldErrors(error, createInternalUserFieldNames);
}

export function getCreateInternalUserServerFieldErrors(
  error: string,
): CreateInternalUserFieldErrors {
  if (
    error === "Ese nombre de usuario interno ya existe." ||
    error === "Ese nombre de usuario interno está reservado." ||
    error === internalUsernameRuleMessage
  ) {
    return { internalUsername: error };
  }

  return getEmptyFieldErrors<CreateInternalUserField>();
}

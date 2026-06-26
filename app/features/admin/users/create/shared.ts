import { z } from "zod";

import { isInternalUserRole } from "@/lib/auth/internal-user-roles";
import { requiredFieldMessage } from "@/lib/shared/forms";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";

const temporaryPasswordMinLength = 8;

const requiredTextField = () => z.string().trim().min(1, requiredFieldMessage);

const optionalEmailField = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || z.email().safeParse(value).success,
    "Ingresá un correo válido o dejalo vacío.",
  );

const roleField = z
  .string()
  .trim()
  .min(1, requiredFieldMessage)
  .refine(isInternalUserRole, "Elegí un permiso principal válido.");

export const createInternalUserIntent = "create-internal-user";

export const createInternalUserSchema = z.object({
  name: requiredTextField(),
  internalUsername: requiredTextField(),
  role: roleField,
  temporaryPassword: requiredTextField().refine(
    (value) => value.length >= temporaryPasswordMinLength,
    `La contraseña temporal debe tener al menos ${temporaryPasswordMinLength} caracteres.`,
  ),
  email: optionalEmailField,
});

export const createInternalUserFieldNames = [
  "name",
  "internalUsername",
  "role",
  "temporaryPassword",
  "email",
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
  temporaryPassword: string;
  email: string;
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
    temporaryPassword: "",
    email: "",
  };

export const emptyCreateInternalUserFieldErrors =
  getEmptyFieldErrors<CreateInternalUserField>();

export function readCreateInternalUserFormValues(
  formData: FormData,
): CreateInternalUserFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    internalUsername: String(formData.get("internalUsername") ?? ""),
    role: String(formData.get("role") ?? ""),
    temporaryPassword: String(formData.get("temporaryPassword") ?? ""),
    email: String(formData.get("email") ?? ""),
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
    error === "Ingresá un nombre de usuario interno válido."
  ) {
    return { internalUsername: error };
  }

  if (error === "Ese correo ya tiene un usuario en En Escena.") {
    return { email: error };
  }

  return getEmptyFieldErrors<CreateInternalUserField>();
}

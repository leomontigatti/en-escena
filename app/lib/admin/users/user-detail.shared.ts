import { z } from "zod";

import {
  getUserKind,
  isInternalUserRole,
  type UserKind,
  type UserRole,
} from "@/lib/auth/user-role.shared";
import {
  toUserAccessState,
  type UserAccessState,
} from "@/lib/auth/user-access-state.shared";
import { requiredFieldMessage } from "@/lib/shared/forms";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import {
  notificationToasts,
  type NotificationKey,
} from "@/lib/shared/notification-toasts";

const passwordMinLength = 8;

const updateInternalUserFieldNames = ["name", "role"] as const;

export type UpdateInternalUserField =
  (typeof updateInternalUserFieldNames)[number];
export type UpdateInternalUserFieldErrors = Partial<
  Record<UpdateInternalUserField, string>
>;

export type UpdateInternalUserFormValues = {
  name: string;
  role: string;
};

export type ResetPasswordFormValues = {
  password: string;
};

export type DetailUserType = UserKind;

export type DetailUserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  internalUsername: string | null;
  suspended: boolean;
  academyId: string | null;
  academyName: string | null;
  academyContactName: string | null;
};

export type DetailUser = {
  academyId: string | null;
  academyName: string | null;
  email: string | null;
  identifier: string;
  id: string;
  mainRole: UserRole;
  name: string;
  state: UserAccessState;
  userType: DetailUserType;
};

export type UserDetailLoaderData = {
  backToList: string;
  canWrite: boolean;
  user: DetailUser;
};

export type DetailActionData = {
  form: "edit" | "reset-password" | "status";
  status: "error";
  message: string;
  fieldErrors: UpdateInternalUserFieldErrors;
  editValues: UpdateInternalUserFormValues;
  resetPasswordValues: ResetPasswordFormValues;
};

export type DetailSuccessData = {
  status: "success";
  message: string;
};

export type DetailViewActionData = DetailActionData | DetailSuccessData;

const emptyEditValues: UpdateInternalUserFormValues = {
  name: "",
  role: "judge",
};

export const emptyResetPasswordValues: ResetPasswordFormValues = {
  password: "",
};

const emptyUpdateInternalUserFieldErrors =
  getEmptyFieldErrors<UpdateInternalUserField>();

const requiredTextField = () => z.string().trim().min(1, requiredFieldMessage);

const roleField = z
  .string()
  .trim()
  .min(1, requiredFieldMessage)
  .refine(isInternalUserRole, "Elegí un permiso principal válido.");

export const updateInternalUserSchema = z.object({
  name: requiredTextField(),
  role: roleField,
});

export const suspendUserIntent = "suspend-user";
export const reactivateUserIntent = "reactivate-user";
export const userStatusIntentSchema = z.enum([
  suspendUserIntent,
  reactivateUserIntent,
]);
export const updateInternalUserIntent = "update-internal-user";
export const resetPasswordIntent = "reset-password";
export const resetPasswordSchema = z.object({
  password: requiredTextField().refine(
    (value) => value.length >= passwordMinLength,
    `La contraseña debe tener al menos ${passwordMinLength} caracteres.`,
  ),
});

export type UserRouteNotification = Extract<
  NotificationKey,
  | "internal-user-updated"
  | "internal-user-reactivated"
  | "internal-user-reset"
  | "internal-user-suspended"
>;

export function buildDetailUser(row: DetailUserRow): DetailUser {
  const userType = getUserKind(row.role);
  const isAcademyUser = userType === "academy";
  const signsInByEmail = userType !== "internal";

  return {
    academyId: isAcademyUser ? row.academyId : null,
    academyName: isAcademyUser ? row.academyName : null,
    email: signsInByEmail ? row.email : null,
    identifier: row.internalUsername ?? row.email,
    id: row.id,
    mainRole: row.role,
    // An individual's owner row carries its person's full name as contact.
    name: getDetailName(row, signsInByEmail),
    state: toUserAccessState(row),
    userType,
  };
}

export function buildBackToListHref(requestUrl: string) {
  const url = new URL(requestUrl);
  return buildPathWithSearch(
    "/administracion/usuarios",
    sanitizeUserDetailSearchParams(url.searchParams),
  );
}

// In-place editing on the detail does not redirect: it returns
// `{ status: "success", message }`, the loader revalidates and the view fires the
// toast directly from `actionData`. See docs/agents/form-feedback.md.
export function buildDetailActionSuccess(
  notification: UserRouteNotification,
): DetailSuccessData {
  return {
    status: "success",
    message: notificationToasts[notification].message,
  };
}

function sanitizeUserDetailSearchParams(searchParams: URLSearchParams) {
  const nextSearchParams = new URLSearchParams(searchParams);

  nextSearchParams.delete("guardado");
  nextSearchParams.delete("tipoGuardado");

  return nextSearchParams;
}

export function getDetailDescription(
  userType: DetailUserType,
  canWrite: boolean,
) {
  if (userType === "academy") {
    return "Consultá la identidad de acceso de la academia en modo solo lectura.";
  }

  if (userType === "individual") {
    return "Consultá la identidad de acceso del Particular en modo solo lectura.";
  }

  if (canWrite) {
    return "Actualizá los datos del usuario interno y sus permisos.";
  }

  return "Consultá la identidad interna en modo solo lectura.";
}

export function readUpdateInternalUserFormValues(
  formData: FormData,
): UpdateInternalUserFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    role: String(formData.get("role") ?? ""),
  };
}

export function readResetPasswordFormValues(
  formData: FormData,
): ResetPasswordFormValues {
  return {
    password: String(formData.get("password") ?? ""),
  };
}

export function buildUpdateInternalUserFormValues(
  user: DetailUser,
): UpdateInternalUserFormValues {
  return {
    name: user.name,
    role: user.mainRole === "academy" ? "judge" : user.mainRole,
  };
}

export function buildDetailActionError({
  editValues = emptyEditValues,
  fieldErrors = emptyUpdateInternalUserFieldErrors,
  form,
  message,
  resetPasswordValues = emptyResetPasswordValues,
}: {
  editValues?: UpdateInternalUserFormValues;
  fieldErrors?: UpdateInternalUserFieldErrors;
  form: DetailActionData["form"];
  message: string;
  resetPasswordValues?: ResetPasswordFormValues;
}): DetailActionData {
  return {
    form,
    status: "error",
    message,
    fieldErrors,
    editValues,
    resetPasswordValues,
  };
}

export function getUpdateInternalUserServerFieldErrors() {
  return getEmptyFieldErrors<UpdateInternalUserField>();
}

export function getUpdateInternalUserFieldErrors(error: z.ZodError) {
  return getFieldErrors(error, updateInternalUserFieldNames);
}

function getDetailName(row: DetailUserRow, ownsAnAccount: boolean) {
  if (ownsAnAccount) {
    return row.academyContactName ?? row.name;
  }

  return row.name;
}

function buildPathWithSearch(pathname: string, searchParams: URLSearchParams) {
  const search = searchParams.toString();

  return search ? `${pathname}?${search}` : pathname;
}

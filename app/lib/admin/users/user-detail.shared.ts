import { z } from "zod";

import { isInternalCredentialEmail } from "@/lib/admin/users/internal-user-credentials.shared";
import { requiredFieldMessage } from "@/lib/shared/forms";
import {
  getEmptyFieldErrors,
  getFieldErrors,
} from "@/lib/shared/form-validation";
import {
  routeNotificationToasts,
  type RouteNotificationKey,
} from "@/lib/shared/route-notification-toasts";

const routeNotificationSearchParam = "notificacion";
const temporaryPasswordMinLength = 8;

const updateInternalUserFieldNames = ["name", "email", "role"] as const;
const resetPasswordFieldNames = ["temporaryPassword"] as const;

export type UpdateInternalUserField =
  (typeof updateInternalUserFieldNames)[number];
export type ResetPasswordField = (typeof resetPasswordFieldNames)[number];
export type UpdateInternalUserFieldErrors = Partial<
  Record<UpdateInternalUserField, string>
>;
export type ResetPasswordFieldErrors = Partial<
  Record<ResetPasswordField, string>
>;

export type UpdateInternalUserFormValues = {
  name: string;
  email: string;
  role: string;
};

export type ResetPasswordFormValues = {
  temporaryPassword: string;
};

export type DetailUserRole = "academy" | "admin" | "auditor" | "judge";
export type DetailUserState =
  | "active"
  | "mandatory-password-change"
  | "suspended";
export type DetailUserType = "academy" | "internal";

export type DetailUserRow = {
  id: string;
  name: string;
  email: string;
  role: DetailUserRole;
  internalUsername: string | null;
  requiresPasswordChange: boolean;
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
  mainRole: DetailUserRole;
  name: string;
  state: DetailUserState;
  userType: DetailUserType;
};

export type UserDetailLoaderData = {
  backToList: string;
  canManage: boolean;
  cancelHref: string;
  editHref: string;
  isEditing: boolean;
  isResettingPassword: boolean;
  resetPasswordHref: string;
  user: DetailUser;
};

export const detailUserRoleOptions = [
  { value: "admin", label: "Administrador" },
  { value: "auditor", label: "Auditor" },
  { value: "judge", label: "Juez" },
  { value: "academy", label: "Academia" },
] as const satisfies ReadonlyArray<{ value: DetailUserRole; label: string }>;

export const internalUserRoleOptions = detailUserRoleOptions.filter(
  (option) => option.value !== "academy",
);

export const detailUserStateOptions = [
  { value: "active", label: "Activo" },
  { value: "mandatory-password-change", label: "Cambio obligatorio" },
  { value: "suspended", label: "Suspendido" },
] as const satisfies ReadonlyArray<{ value: DetailUserState; label: string }>;

export type DetailActionData = {
  form: "edit" | "reset-password" | "status";
  status: "error";
  message: string;
  fieldErrors: UpdateInternalUserFieldErrors;
  resetPasswordFieldErrors: ResetPasswordFieldErrors;
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
  email: "",
  role: "judge",
};

export const emptyResetPasswordValues: ResetPasswordFormValues = {
  temporaryPassword: "",
};

const emptyUpdateInternalUserFieldErrors =
  getEmptyFieldErrors<UpdateInternalUserField>();
const emptyResetPasswordFieldErrors = getEmptyFieldErrors<ResetPasswordField>();

const requiredTextField = () => z.string().trim().min(1, requiredFieldMessage);

const optionalEmailField = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || z.email().safeParse(value).success,
    "Ingresá un correo válido o dejalo vacío.",
  );

function isInternalUserRole(
  value: string,
): value is Extract<DetailUserRole, "admin" | "auditor" | "judge"> {
  return value === "admin" || value === "auditor" || value === "judge";
}

const roleField = z
  .string()
  .trim()
  .min(1, requiredFieldMessage)
  .refine(isInternalUserRole, "Elegí un permiso principal válido.");

export const updateInternalUserSchema = z.object({
  name: requiredTextField(),
  email: optionalEmailField,
  role: roleField,
});

export const userStatusIntentSchema = z.enum([
  "suspend-user",
  "reactivate-user",
]);
export const resetPasswordIntent = "reset-password";
export const resetPasswordSchema = z.object({
  temporaryPassword: requiredTextField().refine(
    (value) => value.length >= temporaryPasswordMinLength,
    `La contraseña temporal debe tener al menos ${temporaryPasswordMinLength} caracteres.`,
  ),
});

export type UserRouteNotification = Extract<
  RouteNotificationKey,
  | "usuario-interno-actualizado"
  | "usuario-interno-reactivado"
  | "usuario-interno-restablecido"
  | "usuario-interno-suspendido"
>;

export function buildDetailUser(row: DetailUserRow): DetailUser {
  const isAcademyUser = row.role === "academy";

  return {
    academyId: isAcademyUser ? row.academyId : null,
    academyName: isAcademyUser ? row.academyName : null,
    email: getDetailEmail(row, isAcademyUser),
    identifier: row.internalUsername ?? row.email,
    id: row.id,
    mainRole: row.role,
    name: getDetailName(row, isAcademyUser),
    state: getDetailState(row, isAcademyUser),
    userType: isAcademyUser ? "academy" : "internal",
  };
}

export function buildBackToListHref(requestUrl: string) {
  const url = new URL(requestUrl);
  return buildPathWithSearch(
    "/administracion/usuarios",
    sanitizeUserDetailSearchParams(url.searchParams),
  );
}

export function buildModeHref(
  url: URL,
  userId: string,
  mode: "editar" | "restablecer-contrasena" | null,
) {
  const nextSearchParams = sanitizeUserDetailSearchParams(url.searchParams);

  if (mode) {
    nextSearchParams.set("modo", mode);
  } else {
    nextSearchParams.delete("modo");
  }

  return buildUserDetailPath(userId, nextSearchParams);
}

// La edición en el lugar del detalle no redirige: retorna
// `{ status: "success", message }`, el loader revalida y la vista dispara el
// toast directo desde `actionData`. Ver docs/agents/form-feedback.md.
export function buildDetailActionSuccess(
  notification: UserRouteNotification,
): DetailSuccessData {
  return {
    status: "success",
    message: routeNotificationToasts[notification].message,
  };
}

function sanitizeUserDetailSearchParams(searchParams: URLSearchParams) {
  const nextSearchParams = new URLSearchParams(searchParams);

  nextSearchParams.delete("modo");
  nextSearchParams.delete(routeNotificationSearchParam);
  nextSearchParams.delete("guardado");
  nextSearchParams.delete("tipoGuardado");

  return nextSearchParams;
}

export function getDetailDescription(
  userType: DetailUserType,
  canManage: boolean,
) {
  if (userType === "academy") {
    return "Consultá la identidad de acceso de la Academia en modo solo lectura.";
  }

  if (canManage) {
    return "Actualizá los datos del usuario interno y sus permisos.";
  }

  return "Consultá la identidad interna en modo solo lectura.";
}

export function readUpdateInternalUserFormValues(
  formData: FormData,
): UpdateInternalUserFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
  };
}

export function readResetPasswordFormValues(
  formData: FormData,
): ResetPasswordFormValues {
  return {
    temporaryPassword: String(formData.get("temporaryPassword") ?? ""),
  };
}

export function buildUpdateInternalUserFormValues(
  user: DetailUser,
): UpdateInternalUserFormValues {
  return {
    name: user.name,
    email: user.email ?? "",
    role: user.mainRole === "academy" ? "judge" : user.mainRole,
  };
}

export function buildDetailActionError({
  editValues = emptyEditValues,
  fieldErrors = emptyUpdateInternalUserFieldErrors,
  form,
  message,
  resetPasswordFieldErrors = emptyResetPasswordFieldErrors,
  resetPasswordValues = emptyResetPasswordValues,
}: {
  editValues?: UpdateInternalUserFormValues;
  fieldErrors?: UpdateInternalUserFieldErrors;
  form: DetailActionData["form"];
  message: string;
  resetPasswordFieldErrors?: ResetPasswordFieldErrors;
  resetPasswordValues?: ResetPasswordFormValues;
}): DetailActionData {
  return {
    form,
    status: "error",
    message,
    fieldErrors,
    resetPasswordFieldErrors,
    editValues,
    resetPasswordValues,
  };
}

export function getUpdateInternalUserServerFieldErrors(error: string) {
  if (error === "Ese correo ya tiene un usuario en En Escena.") {
    return { email: error };
  }

  return getEmptyFieldErrors<UpdateInternalUserField>();
}

export function getUpdateInternalUserFieldErrors(error: z.ZodError) {
  return getFieldErrors(error, updateInternalUserFieldNames);
}

export function getResetPasswordFieldErrors(error: z.ZodError) {
  return getFieldErrors(error, resetPasswordFieldNames);
}

function getDetailEmail(row: DetailUserRow, isAcademyUser: boolean) {
  if (isAcademyUser) {
    return row.email;
  }

  return isInternalCredentialEmail(row.email) ? null : row.email;
}

function getDetailName(row: DetailUserRow, isAcademyUser: boolean) {
  if (isAcademyUser) {
    return row.academyContactName ?? row.name;
  }

  return row.name;
}

function getDetailState(
  row: DetailUserRow,
  isAcademyUser: boolean,
): DetailUserState {
  if (!isAcademyUser && row.suspended) {
    return "suspended";
  }

  if (!isAcademyUser && row.requiresPasswordChange) {
    return "mandatory-password-change";
  }

  return "active";
}

function buildUserDetailPath(userId: string, searchParams: URLSearchParams) {
  return buildPathWithSearch(
    `/administracion/usuarios/${userId}`,
    searchParams,
  );
}

function buildPathWithSearch(pathname: string, searchParams: URLSearchParams) {
  const search = searchParams.toString();

  return search ? `${pathname}?${search}` : pathname;
}

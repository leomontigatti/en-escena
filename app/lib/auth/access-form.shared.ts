import { z } from "zod";

import type { LoginRedirectReason } from "@/lib/auth/access-redirects.server";
import { requiredFieldMessage } from "@/lib/shared/forms";
import type { ToastVariant } from "@/lib/shared/toasts";

const invalidEmailMessage = "Ingresá un correo electrónico válido.";
const passwordLengthMessage = "La contraseña debe tener al menos 8 caracteres.";
export const passwordMismatchMessage = "Las contraseñas no coinciden.";

export const authToastIds = {
  loginError: "auth:login-error",
  recoveryError: "auth:recovery-error",
  recoveryResult: "auth:recovery-result",
  resetPasswordError: "auth:reset-password-error",
  mandatoryPasswordChangeError: "auth:mandatory-password-change-error",
  invitationError: "auth:invitation-error",
  registrationError: "auth:registration-error",
  registrationResult: "auth:registration-result",
  loginContinueNotice: "auth:motivo-continuar",
  loginExpiredNotice: "auth:motivo-expirada",
  loginRecoveryNotice: "auth:recuperacion-ok",
  loginLogoutNotice: "auth:sesion-cerrada",
} as const;

export const loginNotices = {
  continuar: {
    id: authToastIds.loginContinueNotice,
    variant: "error",
    message: "Ingresá para continuar.",
  },
  expirada: {
    id: authToastIds.loginExpiredNotice,
    variant: "error",
    message: "Tu sesión expiró. Volvé a ingresar.",
  },
} satisfies Record<LoginRedirectReason, LoginNotice>;

/**
 * A notice for someone who exists as a user but does not yet have a credential to
 * sign in with (#491). It happens with the accounts that came from Supabase Auth:
 * the migration did not bring the passwords across, so a new one has to be
 * chosen. The message deliberately avoids mentioning the migration — it ages
 * badly, and the user is better served knowing what to do than why it happened.
 */
export const passwordResetRequiredMessage =
  "Necesitás crear una contraseña nueva para ingresar. Usá «Recuperala» acá abajo.";

/**
 * Internal users have no self-service recovery: the `isEligibleAcademyRecoveryEmail`
 * gate only lets academies through, so sending them to «Recuperala» leaves them
 * knocking on a closed door.
 */
export const internalPasswordResetRequiredMessage =
  "Necesitás una contraseña nueva para ingresar. Pedile a un administrador que te la restablezca.";

export const recoverySuccessNotice = {
  id: authToastIds.loginRecoveryNotice,
  variant: "success",
  message: "Tu contraseña fue actualizada. Ya podés ingresar.",
} satisfies LoginNotice;

export const logoutSuccessNotice = {
  id: authToastIds.loginLogoutNotice,
  variant: "info",
  message: "Cerraste sesión.",
} satisfies LoginNotice;

export type LoginNotice = {
  id: string;
  variant: ToastVariant;
  message: string;
};

export function requiredTextField() {
  return z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim().min(1, requiredFieldMessage),
  );
}

export function emailField() {
  return z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim().min(1, requiredFieldMessage).email(invalidEmailMessage),
  );
}

export function passwordField() {
  return z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().min(1, requiredFieldMessage).min(8, passwordLengthMessage),
  );
}

export function readFormValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

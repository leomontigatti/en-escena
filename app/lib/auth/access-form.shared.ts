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

export const recoverySuccessNotice = {
  id: authToastIds.loginRecoveryNotice,
  variant: "success",
  message: "Tu contraseña fue actualizada. Ya podés ingresar.",
} satisfies LoginNotice;

export const logoutSuccessNotice = {
  id: authToastIds.loginLogoutNotice,
  variant: "success",
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

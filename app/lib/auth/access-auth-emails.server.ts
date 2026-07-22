import { sendEmail } from "@/lib/shared/email.server";

// Emails de acceso en español enviados por el flujo built-in de Better Auth
// (#424). Reemplazan al webhook `Send Email` de Supabase (`handleSupabaseSendEmailHook`,
// retirado): el contenido y el envío ahora son app-owned vía `sendEmail` (Resend),
// y los links apuntan a las páginas del front que consumen los tokens de Better
// Auth (`/registro/confirmar` con `token_hash`, `/cambiar-contrasena` con `code`).

// Link de confirmación de alta pública de academia. Apunta a `/registro/confirmar`
// con el `token_hash` app-owned (alta pendiente de `startEmailSignUp`) y `type=signup`.
export function buildAcademySignUpConfirmationLink(input: {
  redirectTo: string;
  tokenHash: string;
}): string {
  const url = new URL(input.redirectTo);
  url.searchParams.set("token_hash", input.tokenHash);
  url.searchParams.set("type", "signup");
  return url.toString();
}

// Link de recuperación de acceso. `resetUrl` es la URL que Better Auth arma para
// `sendResetPassword` (`.../api/auth/reset-password/<token>?callbackURL=<redirectTo>`);
// tomamos el `callbackURL` (la página del front) y le colgamos el `code=<token>`
// que consume el loader de `/cambiar-contrasena`.
export function buildAccessRecoveryLink(input: {
  resetUrl: string;
  fallbackBaseUrl: string;
  token: string;
}): string {
  const callbackUrl = new URL(input.resetUrl).searchParams.get("callbackURL");
  const target = new URL(callbackUrl ?? input.fallbackBaseUrl);
  target.searchParams.set("code", input.token);
  return target.toString();
}

export async function sendAcademySignUpConfirmationEmail(input: {
  to: string;
  confirmationUrl: string;
}): Promise<void> {
  await sendEmail({
    to: input.to,
    subject: "Confirmá tu correo en En Escena",
    text: [
      "Hola,",
      "",
      "Confirmá tu correo para seguir con el registro de tu academia en En Escena:",
      "",
      input.confirmationUrl,
      "",
      "Si no solicitaste este registro, no hace falta que hagas nada.",
      "",
      "El equipo de En Escena",
    ].join("\n"),
  });
}

export async function sendAccessRecoveryEmail(input: {
  to: string;
  recoveryUrl: string;
}): Promise<void> {
  await sendEmail({
    to: input.to,
    subject: "Recuperá tu acceso a En Escena",
    text: [
      "Hola,",
      "",
      "Usá este enlace para definir una nueva contraseña de acceso a En Escena:",
      "",
      input.recoveryUrl,
      "",
      "Si no solicitaste recuperar tu acceso, no hace falta que hagas nada.",
      "",
      "El equipo de En Escena",
    ].join("\n"),
  });
}

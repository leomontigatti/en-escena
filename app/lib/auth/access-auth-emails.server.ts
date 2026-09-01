import { sendEmail } from "@/lib/shared/email.server";

// Access emails in Spanish, sent by Better Auth's built-in flow (#424). They
// replace Supabase's `Send Email` webhook (`handleSupabaseSendEmailHook`,
// retired): the content and the delivery are now app-owned via `sendEmail`
// (Resend), and the links point at the front-end pages that consume Better
// Auth's tokens (`/registro/confirmar` with `token_hash`, `/cambiar-contrasena`
// with `code`).

// The confirmation link for public academy sign-up. It points at
// `/registro/confirmar` with the app-owned `token_hash` (the pending sign-up
// from `startEmailSignUp`) and `type=signup`.
export function buildAcademySignUpConfirmationLink(input: {
  redirectTo: string;
  tokenHash: string;
}): string {
  const url = new URL(input.redirectTo);
  url.searchParams.set("token_hash", input.tokenHash);
  url.searchParams.set("type", "signup");
  return url.toString();
}

// The access recovery link. `resetUrl` is the URL Better Auth builds for
// `sendResetPassword` (`.../api/auth/reset-password/<token>?callbackURL=<redirectTo>`);
// we take the `callbackURL` (the front-end page) and hang the `code=<token>` the
// `/cambiar-contrasena` loader consumes off it.
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

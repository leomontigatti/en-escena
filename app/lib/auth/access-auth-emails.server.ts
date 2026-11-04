import { sendEmail, type SendEmailInput } from "@/lib/shared/email.server";
import { readRelease } from "@/lib/shared/app-environment.server";
import { sendOpsAlert } from "@/lib/shared/ops-alert.server";
import {
  describeServerError,
  readServedRoutePattern,
} from "@/lib/shared/unexpected-error-log.server";
import { recordUnexpectedError } from "@/lib/shared/unexpected-error-store.server";

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

// Whether the email left. A failed send is logged here and reported as `false`
// rather than thrown: the public answer must read the same whether or not the
// address has an account (docs/domain/access.md), and only an address that can
// register or recover ever reaches a send.
export async function sendAcademySignUpConfirmationEmail(input: {
  to: string;
  confirmationUrl: string;
}): Promise<boolean> {
  return await sendAccessEmail("signUpConfirmation", {
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
}): Promise<boolean> {
  return await sendAccessEmail("accessRecovery", {
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

async function sendAccessEmail(
  kind: "accessRecovery" | "signUpConfirmation",
  input: SendEmailInput,
): Promise<boolean> {
  try {
    await sendEmail(input);
    return true;
  } catch (thrown) {
    const stack = describeServerError(thrown);

    console.error("[auth:email:not-sent]", { kind, error: stack });
    // The visitor is told the email left, so nobody else would notice an
    // outage: it is kept and alerted like an unhandled error.
    await recordUnexpectedError(
      {
        source: "server",
        route: readServedRoutePattern(),
        method: "POST",
        userId: null,
        at: new Date(),
        release: readRelease(),
        stack,
      },
      { sendAlert: sendOpsAlert },
    );
    return false;
  }
}

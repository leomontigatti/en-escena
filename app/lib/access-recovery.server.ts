import { normalizeEmail } from "@/lib/academy-registration-token.server";
import { auth } from "@/lib/auth.server";

const RECOVERY_REQUEST_MESSAGE =
  "Si el correo corresponde a un usuario existente, enviamos un enlace para recuperar el acceso.";

export async function requestAccessRecoveryEmail(input: {
  email: string;
  requestUrl: string;
}) {
  const requestOrigin = new URL(input.requestUrl).origin;
  const redirectTo = new URL(
    "/recuperar-acceso/nueva",
    input.requestUrl,
  ).toString();

  await auth.api.requestPasswordReset({
    body: {
      email: normalizeEmail(input.email),
      redirectTo,
    },
    headers: new Headers({
      origin: requestOrigin,
    }),
  });

  return { message: RECOVERY_REQUEST_MESSAGE };
}

export async function resetAccessPassword(input: {
  token: string;
  newPassword: string;
  request: Request;
}) {
  try {
    await auth.api.resetPassword({
      body: {
        token: input.token,
        newPassword: input.newPassword,
      },
      headers: input.request.headers,
    });

    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error:
        "El enlace no es válido o expiró. Pedí uno nuevo para recuperar el acceso.",
    };
  }
}

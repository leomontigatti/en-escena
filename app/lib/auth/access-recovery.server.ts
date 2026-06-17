import { normalizeEmail } from "@/lib/academies/registration-token.server";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";

const RECOVERY_REQUEST_MESSAGE =
  "Si el correo corresponde a un usuario existente, enviamos un enlace para recuperar el acceso.";

export async function requestAccessRecoveryEmail(input: {
  email: string;
  requestUrl: string;
}) {
  const recoveryPageUrl = new URL(
    "/recuperar-acceso/nueva",
    input.requestUrl,
  ).toString();
  const requestOrigin = new URL(input.requestUrl).origin;

  await accessAuthProvider.requestPasswordReset({
    email: normalizeEmail(input.email),
    redirectTo: recoveryPageUrl,
    requestOrigin,
  });

  return { message: RECOVERY_REQUEST_MESSAGE };
}

export async function resetAccessPassword(input: {
  token: string;
  newPassword: string;
  request: Request;
}) {
  try {
    await accessAuthProvider.resetPassword({
      token: input.token,
      newPassword: input.newPassword,
      request: input.request,
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

import { auth } from "@/lib/auth.server";

export async function requestAccessRecoveryEmail(input: {
  email: string;
  requestUrl: string;
}) {
  const resetUrl = new URL("/recuperar-acceso", input.requestUrl);

  await auth.api.requestPasswordReset({
    body: {
      email: input.email,
      redirectTo: resetUrl.toString(),
    },
  });
}

export async function resetAccessPassword(input: {
  token: string;
  password: string;
}) {
  try {
    await auth.api.resetPassword({
      body: {
        token: input.token,
        newPassword: input.password,
      },
    });

    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error: "El enlace no es válido o expiró.",
    };
  }
}

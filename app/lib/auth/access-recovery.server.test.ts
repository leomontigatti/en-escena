import { beforeEach, describe, expect, test, vi } from "vitest";

const requestPasswordReset = vi.hoisted(() => vi.fn());
const resetPassword = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/access-auth-provider.server", () => ({
  accessAuthProvider: {
    requestPasswordReset,
    resetPassword,
  },
}));

import {
  requestAccessRecoveryEmail,
  resetAccessPassword,
} from "@/lib/auth/access-recovery.server";

describe("access recovery", () => {
  beforeEach(() => {
    requestPasswordReset.mockReset();
    resetPassword.mockReset();
  });

  test("requests a reset link without exposing whether the email exists", async () => {
    requestPasswordReset.mockResolvedValue({ status: true });

    const result = await requestAccessRecoveryEmail({
      email: "  USUARIO@Example.COM ",
      requestUrl: "http://localhost:3000/recuperar-acceso",
    });

    expect(result).toEqual({
      message:
        "Si el correo corresponde a un usuario existente, enviamos un enlace para recuperar el acceso.",
    });
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: "usuario@example.com",
      redirectTo: "http://localhost:3000/recuperar-acceso/nueva",
      requestOrigin: "http://localhost:3000",
    });
  });

  test("resets the password through Better Auth", async () => {
    resetPassword.mockResolvedValue({ status: true });
    const request = new Request("http://localhost:3000/recuperar-acceso/nueva");

    const result = await resetAccessPassword({
      token: "reset-token",
      newPassword: "nuevo1234",
      request,
    });

    expect(result).toEqual({ ok: true });
    expect(resetPassword).toHaveBeenCalledWith({
      token: "reset-token",
      newPassword: "nuevo1234",
      request,
    });
  });

  test("returns a Spanish error for invalid reset tokens", async () => {
    resetPassword.mockRejectedValue(new Error("INVALID_TOKEN"));

    const result = await resetAccessPassword({
      token: "expired-token",
      newPassword: "nuevo1234",
      request: new Request("http://localhost:3000/recuperar-acceso/nueva"),
    });

    expect(result).toEqual({
      ok: false,
      error:
        "El enlace no es válido o expiró. Pedí uno nuevo para recuperar el acceso.",
    });
  });
});

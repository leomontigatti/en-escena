import { beforeEach, describe, expect, test, vi } from "vitest";

const requestPasswordReset = vi.hoisted(() => vi.fn());
const exchangePasswordRecoveryCode = vi.hoisted(() => vi.fn());
const updatePasswordForRecovery = vi.hoisted(() => vi.fn());
const signOutCurrentSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/access-auth-provider.server", () => ({
  accessAuthProvider: {
    requestPasswordReset,
    exchangePasswordRecoveryCode,
    updatePasswordForRecovery,
    signOutCurrentSession,
  },
}));

import {
  exchangeAccessRecoveryCode,
  requestAccessRecoveryEmail,
  updateAccessRecoveryPassword,
} from "@/lib/auth/access-recovery.server";

describe("access recovery", () => {
  beforeEach(() => {
    requestPasswordReset.mockReset();
    exchangePasswordRecoveryCode.mockReset();
    updatePasswordForRecovery.mockReset();
    signOutCurrentSession.mockReset();
  });

  test("requests a reset link without exposing whether the email exists", async () => {
    requestPasswordReset.mockResolvedValue({ headers: new Headers() });

    const result = await requestAccessRecoveryEmail({
      email: "  USUARIO@Example.COM ",
      requestUrl: "http://localhost:3000/recuperar-acceso",
      request: new Request("http://localhost:3000/recuperar-acceso"),
      isRecoveryEligible: async () => true,
    });

    expect(result).toEqual({
      headers: new Headers(),
      message:
        "Si el correo corresponde a un usuario existente, enviamos un enlace para recuperar el acceso.",
    });
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: "usuario@example.com",
      redirectTo: "http://localhost:3000/cambiar-contrasena",
      request: expect.any(Request),
    });
  });

  test("exchanges the recovery code through Supabase Auth", async () => {
    exchangePasswordRecoveryCode.mockResolvedValue({
      headers: new Headers(),
      redirectTo: "/cambiar-contrasena?recuperacion=1",
    });

    const result = await exchangeAccessRecoveryCode({
      code: "recovery-code",
      request: new Request("http://localhost:3000/cambiar-contrasena?code=1"),
      redirectTo: "/cambiar-contrasena?recuperacion=1",
    });

    expect(result).toEqual({
      ok: true,
      headers: new Headers(),
      redirectTo: "/cambiar-contrasena?recuperacion=1",
    });
    expect(exchangePasswordRecoveryCode).toHaveBeenCalledWith({
      code: "recovery-code",
      request: expect.any(Request),
      redirectTo: "/cambiar-contrasena?recuperacion=1",
    });
  });

  test("updates the password through Supabase Auth recovery session", async () => {
    updatePasswordForRecovery.mockResolvedValue({ headers: new Headers() });
    signOutCurrentSession.mockResolvedValue({ headers: new Headers() });
    const request = new Request("http://localhost:3000/cambiar-contrasena");

    const result = await updateAccessRecoveryPassword({
      newPassword: "nuevo1234",
      request,
    });

    expect(result).toEqual({ ok: true, headers: new Headers() });
    expect(updatePasswordForRecovery).toHaveBeenCalledWith({
      newPassword: "nuevo1234",
      request,
    });
    expect(signOutCurrentSession).toHaveBeenCalledWith(request);
  });

  test("returns a Spanish error for invalid recovery links", async () => {
    exchangePasswordRecoveryCode.mockRejectedValue(new Error("INVALID_TOKEN"));

    const result = await exchangeAccessRecoveryCode({
      code: "expired-token",
      request: new Request("http://localhost:3000/cambiar-contrasena?code=1"),
      redirectTo: "/cambiar-contrasena?recuperacion=1",
    });

    expect(result).toEqual({
      ok: false,
      error:
        "El enlace no es válido o expiró. Pedí uno nuevo para recuperar el acceso.",
    });
  });

  test("returns a Spanish error when the recovery session cannot update the password", async () => {
    updatePasswordForRecovery.mockRejectedValue(new Error("SESSION_MISSING"));

    const result = await updateAccessRecoveryPassword({
      newPassword: "nuevo1234",
      request: new Request("http://localhost:3000/cambiar-contrasena"),
    });

    expect(result).toEqual({
      ok: false,
      error:
        "El enlace no es válido o expiró. Pedí uno nuevo para recuperar el acceso.",
    });
  });
});

import { beforeEach, describe, expect, test, vi } from "vitest";

import { requiredFieldMessage } from "@/lib/shared/forms";
import { expectThrownResponse } from "@/lib/test-support/http";

const signInCredentialUser = vi.hoisted(() => vi.fn());
const findCredentialUserForIdentifier = vi.hoisted(() => vi.fn());
const hasCredentialAccount = vi.hoisted(() => vi.fn());
const getPostLoginPathForUserId = vi.hoisted(() => vi.fn());
const redirectSignedInUserFromPublicRoute = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/access-auth-provider.server", () => ({
  accessAuthProvider: {
    signInCredentialUser,
  },
}));

vi.mock("@/lib/auth/internal-login.server", () => ({
  findCredentialUserForIdentifier,
  hasCredentialAccount,
}));

vi.mock("@/lib/auth/internal-navigation.server", () => ({
  getPostLoginPathForUserId,
  redirectSignedInUserFromPublicRoute,
}));

import { action as loginAction, getLoginNotice } from "@/routes/ingresar";

describe("access UI validation", () => {
  test("returns field errors for invalid login submissions", async () => {
    const formData = new FormData();
    formData.set("identifier", "");
    formData.set("password", "");

    const result = await loginAction({
      request: new Request("http://localhost:3000/ingresar", {
        method: "POST",
        body: formData,
      }),
      params: {},
      context: {},
      url: new URL("http://localhost:3000/ingresar"),
      pattern: "/ingresar",
    });

    expect(result).toEqual({
      status: "error",
      message: "Revisá los campos marcados.",
      fieldErrors: {
        identifier: requiredFieldMessage,
        password: requiredFieldMessage,
      },
      values: {
        identifier: "",
        password: "",
      },
    });
  });

  test("delegates valid logins through the access auth provider", async () => {
    findCredentialUserForIdentifier.mockResolvedValue({
      email: "admin@example.com",
      emailVerified: true,
      suspended: false,
    });
    signInCredentialUser.mockResolvedValue({
      userId: "user_123",
      headers: new Headers({
        "set-cookie":
          "better-auth.session_token=signed.token; Path=/; HttpOnly",
      }),
    });
    getPostLoginPathForUserId.mockResolvedValue("/administracion");

    const formData = new FormData();
    formData.set("identifier", "admin@example.com");
    formData.set("password", "password-segura");

    const response = await expectThrownResponse(
      loginAction({
        request: new Request("http://localhost:3000/ingresar", {
          method: "POST",
          body: formData,
        }),
        params: {},
        context: {},
        url: new URL("http://localhost:3000/ingresar"),
        pattern: "/ingresar",
      }),
      302,
    );

    expect(signInCredentialUser).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "password-segura",
      request: expect.any(Request),
    });
    expect(response.headers.get("location")).toBe("/administracion");
  });

  test("allows confirmed academy identities without an app user to resume onboarding from login", async () => {
    findCredentialUserForIdentifier.mockResolvedValue(null);
    signInCredentialUser.mockResolvedValue({
      userId: "supabase_user_123",
      headers: new Headers({
        "set-cookie":
          "better-auth.session_token=signed.token; Path=/; HttpOnly",
      }),
    });
    getPostLoginPathForUserId.mockResolvedValue("/registro/academia");

    const formData = new FormData();
    formData.set("identifier", "pendiente@example.com");
    formData.set("password", "password-segura");

    const response = await expectThrownResponse(
      loginAction({
        request: new Request("http://localhost:3000/ingresar", {
          method: "POST",
          body: formData,
        }),
        params: {},
        context: {},
        url: new URL("http://localhost:3000/ingresar"),
        pattern: "/ingresar",
      }),
      302,
    );

    expect(signInCredentialUser).toHaveBeenCalledWith({
      email: "pendiente@example.com",
      password: "password-segura",
      request: expect.any(Request),
    });
    expect(response.headers.get("location")).toBe("/registro/academia");
  });

  describe("failed logins", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    async function submitLogin(identifier: string) {
      const formData = new FormData();
      formData.set("identifier", identifier);
      formData.set("password", "password-vieja");

      return loginAction({
        request: new Request("http://localhost:3000/ingresar", {
          method: "POST",
          body: formData,
        }),
        params: {},
        context: {},
        url: new URL("http://localhost:3000/ingresar"),
        pattern: "/ingresar",
      });
    }

    test("tells an academy without a credential to create a new password", async () => {
      findCredentialUserForIdentifier.mockResolvedValue({
        id: "user_123",
        email: "academia@example.com",
        emailVerified: true,
        role: "academy",
        suspended: false,
        match: "email",
      });
      hasCredentialAccount.mockResolvedValue(false);
      signInCredentialUser.mockRejectedValue(
        new Error("INVALID_EMAIL_OR_PASSWORD"),
      );

      await expect(submitLogin("academia@example.com")).resolves.toMatchObject({
        status: "warning",
        message:
          "Necesitás crear una contraseña nueva para ingresar. Usá «Recuperala» acá abajo.",
      });
    });

    test("sends an internal user to an administrator instead of self-service recovery", async () => {
      findCredentialUserForIdentifier.mockResolvedValue({
        id: "user_admin",
        email: "admin@example.com",
        emailVerified: true,
        role: "admin",
        suspended: false,
        match: "internalUsername",
      });
      hasCredentialAccount.mockResolvedValue(false);
      signInCredentialUser.mockRejectedValue(
        new Error("INVALID_EMAIL_OR_PASSWORD"),
      );

      await expect(submitLogin("admin")).resolves.toMatchObject({
        status: "warning",
        message:
          "Necesitás una contraseña nueva para ingresar. Pedile a un administrador que te la restablezca.",
      });
    });

    test("keeps the generic error when the user does have a credential", async () => {
      findCredentialUserForIdentifier.mockResolvedValue({
        id: "user_123",
        email: "academia@example.com",
        emailVerified: true,
        role: "academy",
        suspended: false,
        match: "email",
      });
      hasCredentialAccount.mockResolvedValue(true);
      signInCredentialUser.mockRejectedValue(
        new Error("INVALID_EMAIL_OR_PASSWORD"),
      );

      await expect(submitLogin("academia@example.com")).resolves.toMatchObject({
        status: "error",
        message: "No pudimos ingresar con esos datos.",
      });
    });

    test("does not reveal anything for an identifier without a user", async () => {
      findCredentialUserForIdentifier.mockResolvedValue(null);
      hasCredentialAccount.mockResolvedValue(false);
      signInCredentialUser.mockRejectedValue(
        new Error("INVALID_EMAIL_OR_PASSWORD"),
      );

      await expect(
        submitLogin("desconocido@example.com"),
      ).resolves.toMatchObject({
        status: "error",
        message: "No pudimos ingresar con esos datos.",
      });

      expect(hasCredentialAccount).not.toHaveBeenCalled();
    });

    test("falls back to the generic error when the credential lookup fails", async () => {
      findCredentialUserForIdentifier.mockResolvedValue({
        id: "user_123",
        email: "academia@example.com",
        emailVerified: true,
        role: "academy",
        suspended: false,
        match: "email",
      });
      hasCredentialAccount.mockRejectedValue(new Error("database is down"));
      signInCredentialUser.mockRejectedValue(
        new Error("INVALID_EMAIL_OR_PASSWORD"),
      );

      await expect(submitLogin("academia@example.com")).resolves.toMatchObject({
        status: "error",
        message: "No pudimos ingresar con esos datos.",
      });
    });
  });

  test("returns the logout completion notice for login", () => {
    expect(getLoginNotice(new URLSearchParams("sesion=cerrada"))).toEqual({
      id: "auth:sesion-cerrada",
      variant: "info",
      message: "Cerraste sesión.",
    });
  });

  test.each([
    [
      "continuar",
      {
        id: "auth:motivo-continuar",
        variant: "error",
        message: "Ingresá para continuar.",
      },
    ],
    [
      "expirada",
      {
        id: "auth:motivo-expirada",
        variant: "error",
        message: "Tu sesión expiró. Volvé a ingresar.",
      },
    ],
  ] as const)("returns the %s login notice", (reason, notice) => {
    expect(getLoginNotice(new URLSearchParams({ motivo: reason }))).toEqual(
      notice,
    );
  });

  test("keeps the recovery success login notice", () => {
    expect(getLoginNotice(new URLSearchParams({ recuperacion: "ok" }))).toEqual(
      {
        id: "auth:recuperacion-ok",
        variant: "success",
        message: "Tu contraseña fue actualizada. Ya podés ingresar.",
      },
    );
  });
});

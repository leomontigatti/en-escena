import { describe, expect, test, vi } from "vitest";

import { requiredFieldMessage } from "@/lib/shared/forms";

const signInEmail = vi.hoisted(() => vi.fn());
const signInCredentialUser = vi.hoisted(() => vi.fn());
const findCredentialUserForIdentifier = vi.hoisted(() => vi.fn());
const getPostLoginPathForUserId = vi.hoisted(() => vi.fn());
const redirectSignedInUserFromPublicRoute = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    api: {
      signInEmail,
    },
  },
}));

vi.mock("@/lib/auth/access-auth-provider.server", () => ({
  accessAuthProvider: {
    signInCredentialUser,
  },
}));

vi.mock("@/lib/auth/internal-login.server", () => ({
  findCredentialUserForIdentifier,
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
    expect(signInEmail).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("/administracion");
  });

  test("returns the logout completion notice for login", () => {
    expect(getLoginNotice(new URLSearchParams("sesion=cerrada"))).toEqual({
      id: "auth:sesion-cerrada",
      variant: "success",
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

async function expectThrownResponse(
  resultPromise: Promise<unknown>,
  status: number,
) {
  try {
    await resultPromise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(status);
    return error as Response;
  }

  throw new Error("Expected a response to be thrown.");
}

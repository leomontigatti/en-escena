import { describe, expect, test, vi } from "vitest";

import { requiredFieldMessage } from "@/lib/shared/forms";

const signInEmail = vi.hoisted(() => vi.fn());
const findCredentialUserForIdentifier = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    api: {
      signInEmail,
    },
  },
}));

vi.mock("@/lib/auth/internal-login.server", () => ({
  findCredentialUserForIdentifier,
}));

vi.mock("@/lib/auth/internal-navigation.server", () => ({
  getLandingPathForUserId: vi.fn(),
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

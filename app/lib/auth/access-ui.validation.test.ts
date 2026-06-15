import { describe, expect, test, vi } from "vitest";

const signInEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    api: {
      signInEmail,
    },
  },
}));

vi.mock("@/lib/auth/internal-navigation.server", () => ({
  getLandingPathForUserId: vi.fn(),
}));

import { action as loginAction, getLoginNotice } from "@/routes/ingresar";

describe("access UI validation", () => {
  test("returns field errors for invalid login submissions", async () => {
    const formData = new FormData();
    formData.set("email", "no-es-correo");
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
        email: "Ingresá un correo electrónico válido.",
        password: "Ingresá tu contraseña.",
      },
    });
  });

  test("returns the logout completion notice for login", () => {
    expect(getLoginNotice(new URLSearchParams("sesion=cerrada"))).toEqual({
      variant: "success",
      message: "Cerraste sesión.",
    });
  });

  test.each([
    [
      "continuar",
      {
        variant: "info",
        message: "Ingresá para continuar.",
      },
    ],
    [
      "expirada",
      {
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
        variant: "success",
        message: "Tu contraseña fue actualizada. Ya podés ingresar.",
      },
    );
  });
});

import { describe, expect, test, vi } from "vitest";

const signInEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth.server", () => ({
  auth: {
    api: {
      signInEmail,
    },
  },
}));

vi.mock("@/lib/internal-navigation.server", () => ({
  getLandingPathForUserId: vi.fn(),
}));

import { action as loginAction } from "@/routes/ingresar";

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
});

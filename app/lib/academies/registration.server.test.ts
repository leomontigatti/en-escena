import { RouterContextProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { startAcademyRegistration } from "@/lib/academies/registration.server";
import { normalizeEmail } from "@/lib/shared/email-normalization";
import { action as requestRegistrationAction } from "@/routes/registro";

describe("academy registration helpers", () => {
  test("normalizes email input", () => {
    expect(normalizeEmail("  Academia@Example.COM ")).toBe(
      "academia@example.com",
    );
  });

  test("starts the sign-up with the confirmation redirect", async () => {
    const startSignUp = vi.fn(async () => ({
      headers: new Headers(),
    }));

    const result = await startAcademyRegistration({
      email: "  Academia@Example.COM ",
      password: "password-segura",
      request: new Request("http://localhost/registro", {
        method: "POST",
      }),
      requestUrl: "http://localhost/registro",
      isRegistrationEligible: async () => true,
      startAcademyUserSignUp: startSignUp,
    });

    expect(result).toEqual({
      headers: new Headers(),
      message:
        "Si el correo puede registrarse, enviamos un enlace para confirmar la cuenta y seguir con el alta.",
    });
    expect(startSignUp).toHaveBeenCalledWith({
      email: "academia@example.com",
      password: "password-segura",
      redirectTo: "http://localhost/registro/confirmar",
      request: expect.any(Request),
    });
  });

  test("keeps the public response generic when the email already exists", async () => {
    const startSignUp = vi.fn();

    const result = await startAcademyRegistration({
      email: "existente@example.com",
      password: "password-segura",
      request: new Request("http://localhost/registro", {
        method: "POST",
      }),
      requestUrl: "http://localhost/registro",
      isRegistrationEligible: async () => false,
      startAcademyUserSignUp: startSignUp,
    });

    expect(result).toEqual({
      headers: new Headers(),
      message:
        "Si el correo puede registrarse, enviamos un enlace para confirmar la cuenta y seguir con el alta.",
    });
    expect(startSignUp).not.toHaveBeenCalled();
  });

  test("keeps the public response generic when the auth provider reports a duplicate email", async () => {
    const startSignUp = vi.fn(async () => {
      throw new Error("user_already_exists", {
        cause: { code: "user_already_exists" },
      });
    });

    const result = await startAcademyRegistration({
      email: "duplicado@example.com",
      password: "password-segura",
      request: new Request("http://localhost/registro", {
        method: "POST",
      }),
      requestUrl: "http://localhost/registro",
      isRegistrationEligible: async () => true,
      startAcademyUserSignUp: startSignUp,
    });

    expect(result).toEqual({
      headers: new Headers(),
      message:
        "Si el correo puede registrarse, enviamos un enlace para confirmar la cuenta y seguir con el alta.",
    });
  });
});

// Refused before the sign-up starts: an action that reached it would throw here,
// where no database is configured.
describe("academy registration start", () => {
  test("validates email and password confirmation", async () => {
    const result = await requestRegistration("correo-invalido", {
      password: "123",
      confirmPassword: "456",
    });

    expect(result).toEqual({
      status: "error",
      message: "Revisá los datos del formulario.",
      fieldErrors: {
        email: "Ingresá un correo electrónico válido.",
        password: "La contraseña debe tener al menos 8 caracteres.",
        confirmPassword: "Las contraseñas no coinciden.",
      },
      values: {
        email: "correo-invalido",
        password: "",
        confirmPassword: "",
      },
    });
  });
});

async function requestRegistration(
  email: string,
  overrides: { password?: string; confirmPassword?: string } = {},
) {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", overrides.password ?? "password-segura");
  formData.set(
    "confirmPassword",
    overrides.confirmPassword ?? overrides.password ?? "password-segura",
  );

  return await requestRegistrationAction({
    url: new URL("http://localhost/registro"),
    pattern: "/registro",
    request: new Request("http://localhost/registro", {
      method: "POST",
      body: formData,
    }),
    params: {},
    context: new RouterContextProvider(),
  });
}

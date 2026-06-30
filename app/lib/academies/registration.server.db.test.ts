import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { user } from "@/db/schema";
import { action as requestRegistrationAction } from "@/routes/registro";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

const startAcademyUserSignUpMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/academies/registration-auth.server", () => ({
  startAcademyUserSignUp: startAcademyUserSignUpMock,
}));

installDatabaseTestHooks();

describe("academy registration start", () => {
  beforeEach(() => {
    startAcademyUserSignUpMock.mockReset();
    startAcademyUserSignUpMock.mockResolvedValue({ headers: new Headers() });
  });

  test("validates email and password confirmation", async () => {
    const result = await requestRegistration("correo-invalido", {
      password: "123",
      confirmPassword: "456",
    });

    expect(result).toEqual({
      status: "error",
      message: "Revisá los campos marcados.",
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
    expect(startAcademyUserSignUpMock).not.toHaveBeenCalled();
  });

  test("keeps the public response generic when the email already exists", async () => {
    await db.insert(user).values({
      id: "existing_user",
      name: "Existente",
      email: "existente@example.com",
      emailVerified: true,
    });

    const result = await requestRegistration("existente@example.com");

    expect(result).toMatchObject({
      data: {
        status: "success",
        message:
          "Si el correo puede registrarse, enviamos un enlace para confirmar la cuenta y seguir con el alta.",
        values: { email: "existente@example.com" },
      },
    });
    expect(startAcademyUserSignUpMock).not.toHaveBeenCalled();
  });

  test("starts Supabase confirmation without creating domain records before onboarding", async () => {
    startAcademyUserSignUpMock.mockResolvedValueOnce({
      headers: new Headers({
        "set-cookie": "sb-registration=start; Path=/; HttpOnly",
      }),
    });

    const result = await requestRegistration("academia@example.com");

    expect(result).toMatchObject({
      data: {
        status: "success",
        message:
          "Si el correo puede registrarse, enviamos un enlace para confirmar la cuenta y seguir con el alta.",
        values: { email: "academia@example.com" },
      },
      init: {
        headers: expect.any(Headers),
      },
    });
    expect(await db.query.user.findMany()).toEqual([]);
    expect(await db.query.academies.findMany()).toEqual([]);
    expect(startAcademyUserSignUpMock).toHaveBeenCalledWith({
      email: "academia@example.com",
      password: "password-segura",
      redirectTo: "http://localhost/registro/confirmar",
      request: expect.any(Request),
    });
  });
});

async function requestRegistration(
  email: string,
  overrides: {
    password?: string;
    confirmPassword?: string;
  } = {},
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
    context: {},
  });
}

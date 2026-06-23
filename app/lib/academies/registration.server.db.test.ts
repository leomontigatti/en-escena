import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  academies,
  academyRegistrationTokens,
  accessSession,
  user,
} from "@/db/schema";
import {
  completeAcademyRegistration,
  getRegistrationTokenStatus,
} from "@/lib/academies/registration.server";
import { hashRegistrationToken } from "@/lib/academies/registration-token.server";
import {
  action as completeRegistrationAction,
  loader as completeRegistrationLoader,
} from "@/routes/registro_.$token";
import { action as requestRegistrationAction } from "@/routes/registro";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

const SESSION_TTL_MS = vi.hoisted(() => 7 * 24 * 60 * 60 * 1000);
const TOKEN_TEST_TTL_MS = 60_000;

const startAcademyUserSignUpMock = vi.hoisted(() => vi.fn());
const signUpAcademyUserMock = vi.hoisted(() => vi.fn());
const deleteAcademyUserAccessMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/academies/registration-auth.server", () => ({
  startAcademyUserSignUp: startAcademyUserSignUpMock,
  signUpAcademyUser: signUpAcademyUserMock,
  deleteAcademyUserAccess: deleteAcademyUserAccessMock,
}));

installDatabaseTestHooks();

describe("academy registration", () => {
  beforeEach(() => {
    startAcademyUserSignUpMock.mockReset();
    signUpAcademyUserMock.mockReset();
    deleteAcademyUserAccessMock.mockReset();
    installDefaultAcademyAuthMocks();
  });

  test("registration start validates email and password confirmation", async () => {
    const result = await requestRegistrationEmail("correo-invalido", {
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

  test("registration start keeps the public response generic when the email already exists", async () => {
    await db.insert(user).values({
      id: "existing_user",
      name: "Existente",
      email: "existente@example.com",
      emailVerified: true,
    });

    const existingEmailResult = await requestRegistrationEmail(
      "existente@example.com",
    );

    expect(existingEmailResult).toMatchObject({
      data: {
        status: "success",
        message:
          "Si el correo puede registrarse, enviamos un enlace para confirmar la cuenta y seguir con el alta.",
        values: { email: "existente@example.com" },
      },
    });
    expect(startAcademyUserSignUpMock).not.toHaveBeenCalled();
    expect(await db.query.academyRegistrationTokens.findMany()).toEqual([]);
  });

  test("consumes a valid token to create a verified academy user with a session", async () => {
    await insertRegistrationToken({
      email: "academia@example.com",
      token: "valid-token",
    });

    const result = await completeAcademyRegistration(
      createCompleteRegistrationInput("valid-token", {
        academyName: " academia en escena ",
        contactName: " contacto responsable ",
        phone: "1112345678",
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.headers.get("set-cookie")).toContain(
      "sb-access-token",
    );

    const savedUsers = await db.query.user.findMany({
      columns: { id: true, email: true, emailVerified: true, role: true },
    });
    expect(savedUsers).toEqual([
      {
        id: expect.any(String),
        email: "academia@example.com",
        emailVerified: true,
        role: "academy",
      },
    ]);

    const savedAcademies = await db.query.academies.findMany({
      columns: { userId: true, name: true, contactName: true, phone: true },
    });
    expect(savedAcademies).toEqual([
      {
        userId: savedUsers[0]?.id,
        name: "Academia En Escena",
        contactName: "Contacto Responsable",
        phone: "1112345678",
      },
    ]);

    const consumedToken = await db.query.academyRegistrationTokens.findFirst({
      columns: { consumedAt: true },
      where: eq(academyRegistrationTokens.email, "academia@example.com"),
    });
    expect(consumedToken?.consumedAt).toBeInstanceOf(Date);

    const savedSessions = await db.query.accessSession.findMany({
      columns: { userId: true },
      where: eq(accessSession.userId, savedUsers[0]?.id ?? ""),
    });
    expect(savedSessions).toEqual([{ userId: savedUsers[0]?.id }]);
  });

  test("final registration redirects to the portal with the new session", async () => {
    await insertRegistrationToken({
      email: "portal@example.com",
      token: "portal-token",
    });

    const redirectResponse = await expectRedirectResponse(
      completeRegistrationAction({
        url: new URL("http://localhost/registro/portal-token"),
        pattern: "/registro/:token",
        request: createCompleteRegistrationRequest("portal-token", {
          academyName: "Academia Portal",
          contactName: "Contacto Portal",
          phone: "1122223333",
          password: "password-segura",
          confirmPassword: "password-segura",
        }),
        params: { token: "portal-token" },
        context: {},
      }),
    );

    expect(redirectResponse.status).toBe(302);
    expect(redirectResponse.headers.get("location")).toBe("/portal");
    expect(redirectResponse.headers.get("set-cookie")).toContain(
      "sb-access-token",
    );
    expect(await db.query.user.findMany()).toHaveLength(1);
    expect(await db.query.academies.findMany()).toHaveLength(1);
  });

  test("final registration rejects phone numbers with spaces or separators", async () => {
    await insertRegistrationToken({
      email: "telefono-invalido@example.com",
      token: "invalid-phone-token",
    });

    const result = await completeRegistrationAction({
      url: new URL("http://localhost/registro/invalid-phone-token"),
      pattern: "/registro/:token",
      request: createCompleteRegistrationRequest("invalid-phone-token", {
        academyName: "Academia Telefono",
        contactName: "Contacto Telefono",
        phone: "11 1234-5678",
        password: "password-segura",
        confirmPassword: "password-segura",
      }),
      params: { token: "invalid-phone-token" },
      context: {},
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        phone: "Ingresá 10 dígitos, sin espacios, 0 ni 15.",
      },
      values: {
        phone: "11 1234-5678",
      },
    });
    expect(await db.query.user.findMany()).toEqual([]);
    expect(await db.query.academies.findMany()).toEqual([]);
  });

  test("server registration rejects invalid phone numbers before creating access", async () => {
    await insertRegistrationToken({
      email: "telefono-server@example.com",
      token: "server-invalid-phone-token",
    });

    const result = await completeAcademyRegistration(
      createCompleteRegistrationInput("server-invalid-phone-token", {
        phone: "111234 567",
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: "Ingresá 10 dígitos, sin espacios, 0 ni 15.",
    });
    expect(signUpAcademyUserMock).not.toHaveBeenCalled();
    expect(await db.query.user.findMany()).toEqual([]);
    expect(await db.query.academies.findMany()).toEqual([]);
  });

  test("a valid token opens the final registration step", async () => {
    await insertRegistrationToken({
      email: "formulario@example.com",
      token: "form-token",
    });

    await expect(
      completeRegistrationLoader({
        url: new URL("http://localhost/registro/form-token"),
        pattern: "/registro/:token",
        request: new Request("http://localhost/registro/form-token"),
        params: { token: "form-token" },
        context: {},
      }),
    ).resolves.toEqual({ tokenStatus: "valid" });
  });

  test("rejects expired, consumed, and unknown tokens without creating access", async () => {
    await insertRegistrationToken({
      email: "expirada@example.com",
      token: "expired-token",
      expiresAt: new Date(Date.now() - TOKEN_TEST_TTL_MS),
    });
    await insertRegistrationToken({
      email: "usada@example.com",
      token: "consumed-token",
      consumedAt: new Date(),
    });

    await expectTokenRejection("expired-token");
    await expectTokenRejection("consumed-token");
    await expectTokenRejection("unknown-token");

    expect(await getRegistrationTokenStatus("expired-token")).toBe("invalid");
    expect(await getRegistrationTokenStatus("consumed-token")).toBe("invalid");
    expect(await getRegistrationTokenStatus("unknown-token")).toBe("invalid");
    expect(await db.query.user.findMany()).toEqual([]);
    expect(await db.query.academies.findMany()).toEqual([]);
    expect(await db.query.accessSession.findMany()).toEqual([]);
  });

  test("does not allow a consumed token to create duplicate users or academies", async () => {
    await insertRegistrationToken({
      email: "unica@example.com",
      token: "single-use-token",
    });

    const firstResult = await completeAcademyRegistration(
      createCompleteRegistrationInput("single-use-token", {
        academyName: "Academia Unica",
      }),
    );
    const secondResult = await completeAcademyRegistration(
      createCompleteRegistrationInput("single-use-token", {
        academyName: "Academia Duplicada",
        contactName: "Otro Contacto",
        phone: "1100000000",
      }),
    );

    expect(firstResult.ok).toBe(true);
    expect(secondResult).toEqual({
      ok: false,
      error: "El enlace no es válido o expiró.",
    });
    expect(await db.query.user.findMany()).toHaveLength(1);
    expect(await db.query.academies.findMany()).toHaveLength(1);
    expect(await db.query.accessSession.findMany()).toHaveLength(1);
  });

  test("compensates auth creation and reports email conflicts without consuming the token", async () => {
    await insertRegistrationToken({
      email: "conflicto@example.com",
      token: "conflict-token",
    });
    await db.insert(user).values({
      id: "existing_conflict_user",
      name: "Existente",
      email: "conflicto@example.com",
      emailVerified: true,
    });

    signUpAcademyUserMock.mockImplementationOnce(
      async (input: { email: string }) => ({
        userId: "supabase-conflict-user",
        headers: new Headers({
          "set-cookie": `sb-access-token=${input.email}; Path=/; HttpOnly`,
        }),
      }),
    );

    const result = await completeAcademyRegistration(
      createCompleteRegistrationInput("conflict-token"),
    );

    expect(result).toEqual({
      ok: false,
      error: "Ese correo ya tiene un usuario en En Escena.",
    });
    expect(deleteAcademyUserAccessMock).toHaveBeenCalledWith(
      "supabase-conflict-user",
    );
    expect(await db.query.academies.findMany()).toEqual([]);
    expect(await db.query.accessSession.findMany()).toEqual([]);

    const pendingToken = await db.query.academyRegistrationTokens.findFirst({
      columns: { consumedAt: true },
      where: eq(academyRegistrationTokens.email, "conflicto@example.com"),
    });

    expect(pendingToken?.consumedAt).toBeNull();
  });
});

function installDefaultAcademyAuthMocks() {
  startAcademyUserSignUpMock.mockResolvedValue({ headers: new Headers() });
  signUpAcademyUserMock.mockImplementation(createTestAcademyAccessUser);
  deleteAcademyUserAccessMock.mockImplementation(deleteTestAcademyAccessUser);
}

async function createTestAcademyAccessUser(input: { email: string }) {
  const [{ db }, { accessSession, user }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ]);
  const userId = crypto.randomUUID();
  const sessionToken = crypto.randomUUID();

  await db.insert(user).values({
    id: userId,
    name: input.email,
    email: input.email,
  });
  await db.insert(accessSession).values({
    id: crypto.randomUUID(),
    token: sessionToken,
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  return {
    userId,
    headers: new Headers({
      "set-cookie": `sb-access-token=${sessionToken}; Path=/; HttpOnly`,
    }),
  };
}

async function deleteTestAcademyAccessUser(userId: string) {
  const [{ db }, { accessSession, user }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ]);

  await db.delete(accessSession).where(eq(accessSession.userId, userId));
  await db.delete(user).where(eq(user.id, userId));
}

async function insertRegistrationToken(input: {
  email: string;
  token: string;
  expiresAt?: Date;
  consumedAt?: Date;
}) {
  await db.insert(academyRegistrationTokens).values({
    email: input.email,
    tokenHash: hashRegistrationToken(input.token),
    expiresAt: input.expiresAt ?? new Date(Date.now() + TOKEN_TEST_TTL_MS),
    consumedAt: input.consumedAt,
  });
}

function createCompleteRegistrationInput(
  token: string,
  overrides: Partial<
    Pick<
      Parameters<typeof completeAcademyRegistration>[0],
      "academyName" | "contactName" | "phone" | "password"
    >
  > = {},
): Parameters<typeof completeAcademyRegistration>[0] {
  return {
    token,
    academyName: "Academia",
    contactName: "Contacto",
    phone: "1112345678",
    password: "password-segura",
    request: new Request(`http://localhost/registro/${token}`),
    ...overrides,
  };
}

async function requestRegistrationEmail(
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

async function expectTokenRejection(token: string) {
  await expect(
    completeAcademyRegistration(createCompleteRegistrationInput(token)),
  ).resolves.toEqual({
    ok: false,
    error: "El enlace no es válido o expiró.",
  });
}

function createCompleteRegistrationRequest(
  token: string,
  values: {
    academyName: string;
    contactName: string;
    phone: string;
    password: string;
    confirmPassword: string;
  },
) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return new Request(`http://localhost/registro/${token}`, {
    method: "POST",
    body: formData,
  });
}

async function expectRedirectResponse(resultPromise: Promise<unknown>) {
  try {
    await resultPromise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    return error as Response;
  }

  throw new Error("Expected route action to throw a redirect response.");
}

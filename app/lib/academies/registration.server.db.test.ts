import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  academies,
  academyRegistrationTokens,
  session,
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

const sentEmails = vi.hoisted(
  () =>
    [] as Array<{
      to: string;
      subject: string;
      text: string;
    }>,
);

vi.mock("@/lib/shared/email.server", () => ({
  sendEmail: vi.fn(async (input) => {
    sentEmails.push(input);
  }),
}));

vi.mock("@/lib/academies/registration-auth.server", () => ({
  signUpAcademyUser: vi.fn(async (input: { email: string }) => {
    const [{ db }, { session, user }] = await Promise.all([
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
    await db.insert(session).values({
      id: crypto.randomUUID(),
      token: sessionToken,
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });

    return {
      userId,
      headers: new Headers({
        "set-cookie": `better-auth.session_token=${sessionToken}; Path=/; HttpOnly`,
      }),
    };
  }),
}));

installDatabaseTestHooks();

describe("academy registration", () => {
  beforeEach(() => {
    sentEmails.length = 0;
  });

  test("only registrable emails create tokens while existing users receive guidance", async () => {
    await db.insert(user).values({
      id: "existing_user",
      name: "Existente",
      email: "existente@example.com",
      emailVerified: true,
    });

    const existingEmailResult = await requestRegistrationEmail(
      "existente@example.com",
    );
    const registrableEmailResult =
      await requestRegistrationEmail("nueva@example.com");

    expect(existingEmailResult).toEqual(registrableEmailResult);
    expect(existingEmailResult).toMatchObject({
      status: "success",
      message:
        "Si el correo puede registrarse, enviamos un enlace para completar el alta.",
    });

    const tokens = await db.query.academyRegistrationTokens.findMany({
      columns: { email: true, consumedAt: true },
    });

    expect(tokens).toEqual([{ email: "nueva@example.com", consumedAt: null }]);
    expect(sentEmails).toHaveLength(2);
    expect(sentEmails[0]).toMatchObject({
      to: "existente@example.com",
      subject: "Ya tenés acceso a En Escena",
    });
    expect(sentEmails[1]).toMatchObject({
      to: "nueva@example.com",
      subject: "Completá tu registro en En Escena",
    });

    const existingUserTokens =
      await db.query.academyRegistrationTokens.findMany({
        where: eq(academyRegistrationTokens.email, "existente@example.com"),
      });

    expect(existingUserTokens).toEqual([]);
  });

  test("consumes a valid token to create a verified academy user with a session", async () => {
    await insertRegistrationToken({
      email: "academia@example.com",
      token: "valid-token",
    });

    const result = await completeAcademyRegistration(
      createCompleteRegistrationInput("valid-token", {
        academyName: " Academia En Escena ",
        contactName: " Contacto ",
        phone: " 11 1234-5678 ",
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.headers.get("set-cookie")).toContain(
      "better-auth.session_token",
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
        contactName: "Contacto",
        phone: "11 1234-5678",
      },
    ]);

    const consumedToken = await db.query.academyRegistrationTokens.findFirst({
      columns: { consumedAt: true },
      where: eq(academyRegistrationTokens.email, "academia@example.com"),
    });
    expect(consumedToken?.consumedAt).toBeInstanceOf(Date);

    const savedSessions = await db.query.session.findMany({
      columns: { userId: true },
      where: eq(session.userId, savedUsers[0]?.id ?? ""),
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
          phone: "11 2222-3333",
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
      "better-auth.session_token",
    );
    expect(await db.query.user.findMany()).toHaveLength(1);
    expect(await db.query.academies.findMany()).toHaveLength(1);
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

  test("requesting a new registration link consumes previous pending tokens for that email", async () => {
    await requestRegistrationEmail("reintento@example.com");
    await requestRegistrationEmail("reintento@example.com");

    const tokens = await db.query.academyRegistrationTokens.findMany({
      columns: { email: true, consumedAt: true },
      where: eq(academyRegistrationTokens.email, "reintento@example.com"),
      orderBy: (tokensTable, { asc }) => asc(tokensTable.createdAt),
    });

    expect(tokens).toHaveLength(2);
    expect(tokens[0]?.consumedAt).toBeInstanceOf(Date);
    expect(tokens[1]).toEqual({
      email: "reintento@example.com",
      consumedAt: null,
    });
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
    expect(await db.query.session.findMany()).toEqual([]);
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
        phone: "11 0000-0000",
      }),
    );

    expect(firstResult.ok).toBe(true);
    expect(secondResult).toEqual({
      ok: false,
      error: "El enlace no es válido o expiró.",
    });
    expect(await db.query.user.findMany()).toHaveLength(1);
    expect(await db.query.academies.findMany()).toHaveLength(1);
    expect(await db.query.session.findMany()).toHaveLength(1);
  });
});

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
    phone: "11 1234-5678",
    password: "password-segura",
    request: new Request(`http://localhost/registro/${token}`),
    ...overrides,
  };
}

async function requestRegistrationEmail(email: string) {
  const formData = new FormData();
  formData.set("email", email);

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

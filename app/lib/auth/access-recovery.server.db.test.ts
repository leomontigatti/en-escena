import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { academies, accessSession, user } from "@/db/schema";
import {
  createLocalAccessUser,
  readLocalAccessSession,
  signInLocalAccessUser,
} from "@/lib/auth/access-test-auth.server";
import { requestAccessRecoveryEmail } from "@/lib/auth/access-recovery.server";
import {
  action as changePasswordAction,
  loader as changePasswordLoader,
} from "@/routes/cambiar-contrasena";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

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

const OLD_PASSWORD = "old-password";
const NEW_PASSWORD = "new-password";
const RESET_PASSWORD_PATH = "/cambiar-contrasena";
const RESET_PASSWORD_ACTION_URL = `http://localhost${RESET_PASSWORD_PATH}`;
const RECOVERY_REQUEST_URL = "http://localhost:3000/recuperar-acceso";

installDatabaseTestHooks();

describe("access recovery", () => {
  beforeEach(() => {
    sentEmails.length = 0;
  });

  test("requests a Supabase reset only for eligible academy users", async () => {
    const signUpResult = await createLocalAccessUser({
      email: "usuario@example.com",
      name: "Usuario",
      password: OLD_PASSWORD,
    });

    await db
      .update(user)
      .set({ emailVerified: true, role: "academy" })
      .where(eq(user.id, signUpResult.user.id));

    await db.insert(academies).values({
      userId: signUpResult.user.id,
      name: "Academia Norte",
      contactName: "Usuario",
      phone: "123456",
    });

    const requestPasswordReset = vi.fn().mockResolvedValue({
      headers: new Headers(),
    });

    const result = await requestAccessRecoveryEmail({
      email: "usuario@example.com",
      requestUrl: RECOVERY_REQUEST_URL,
      request: new Request(RECOVERY_REQUEST_URL, { method: "POST" }),
      requestPasswordReset,
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

  test("returns the generic response without triggering reset for internal, suspended or missing emails", async () => {
    const internalUser = await createLocalAccessUser({
      email: "interno@example.com",
      name: "Interno",
      password: OLD_PASSWORD,
    });
    const suspendedUser = await createLocalAccessUser({
      email: "suspendido@example.com",
      name: "Suspendido",
      password: OLD_PASSWORD,
    });

    await db
      .update(user)
      .set({ emailVerified: true, role: "admin" })
      .where(eq(user.id, internalUser.user.id));
    await db
      .update(user)
      .set({ emailVerified: true, role: "academy", suspended: true })
      .where(eq(user.id, suspendedUser.user.id));
    await db.insert(academies).values({
      userId: suspendedUser.user.id,
      name: "Academia Sur",
      contactName: "Suspendido",
      phone: "123456",
    });

    const requestPasswordReset = vi.fn().mockResolvedValue({
      headers: new Headers(),
    });

    await expect(
      requestAccessRecoveryEmail({
        email: "interno@example.com",
        requestUrl: RECOVERY_REQUEST_URL,
        request: new Request(RECOVERY_REQUEST_URL, { method: "POST" }),
        requestPasswordReset,
      }),
    ).resolves.toMatchObject({
      message:
        "Si el correo corresponde a un usuario existente, enviamos un enlace para recuperar el acceso.",
    });
    await expect(
      requestAccessRecoveryEmail({
        email: "suspendido@example.com",
        requestUrl: RECOVERY_REQUEST_URL,
        request: new Request(RECOVERY_REQUEST_URL, { method: "POST" }),
        requestPasswordReset,
      }),
    ).resolves.toMatchObject({
      message:
        "Si el correo corresponde a un usuario existente, enviamos un enlace para recuperar el acceso.",
    });
    await expect(
      requestAccessRecoveryEmail({
        email: "inexistente@example.com",
        requestUrl: RECOVERY_REQUEST_URL,
        request: new Request(RECOVERY_REQUEST_URL, { method: "POST" }),
        requestPasswordReset,
      }),
    ).resolves.toMatchObject({
      message:
        "Si el correo corresponde a un usuario existente, enviamos un enlace para recuperar el acceso.",
    });

    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  test("completes academy recovery through /cambiar-contrasena and revokes existing sessions", async () => {
    const { recoveryCode, sessionCookie, userId } =
      await createRecoverySessionState("revocar-sesiones@example.com");

    const loaderResponse = await expectThrownResponse(
      changePasswordLoader({
        url: new URL(
          `http://localhost/cambiar-contrasena?code=${recoveryCode}`,
        ),
        pattern: "/cambiar-contrasena",
        request: new Request(
          `http://localhost/cambiar-contrasena?code=${recoveryCode}`,
        ),
        params: {},
        context: {},
      }),
    );

    expect(loaderResponse.headers.get("location")).toBe(
      "/cambiar-contrasena?recuperacion=1",
    );

    const recoveryCookie = createRecoveryCookie(loaderResponse.headers);

    const response = await expectThrownResponse(
      changePasswordAction({
        url: new URL("http://localhost/cambiar-contrasena?recuperacion=1"),
        pattern: "/cambiar-contrasena",
        request: createChangePasswordRequest({
          password: NEW_PASSWORD,
          cookie: recoveryCookie,
          requestUrl: "http://localhost/cambiar-contrasena?recuperacion=1",
        }),
        params: {},
        context: {},
      }),
    );

    expect(response.headers.get("location")).toBe("/ingresar?recuperacion=ok");
    await expect(findSessionsByUserId(userId)).resolves.toEqual([]);
    await expect(
      readLocalAccessSession(new Headers({ cookie: sessionCookie })),
    ).resolves.toBeNull();
    await expect(
      signInLocalAccessUser({
        email: "revocar-sesiones@example.com",
        password: NEW_PASSWORD,
      }),
    ).resolves.toMatchObject({
      user: { email: "revocar-sesiones@example.com" },
    });
  });
});

async function createRecoverySessionState(email: string) {
  const signUpResult = await createLocalAccessUser({
    email,
    name: email,
    password: OLD_PASSWORD,
  });

  await db
    .update(user)
    .set({ emailVerified: true, role: "academy" })
    .where(eq(user.id, signUpResult.response.user.id));

  await db.insert(academies).values({
    userId: signUpResult.response.user.id,
    name: "Academia Oeste",
    contactName: email,
    phone: "123456",
  });

  const recoveryResult = await requestAccessRecoveryEmail({
    email,
    requestUrl: RECOVERY_REQUEST_URL,
    request: new Request(RECOVERY_REQUEST_URL, { method: "POST" }),
  });

  if (!recoveryResult.debugRecoveryCode) {
    throw new Error("Expected a test recovery code.");
  }

  return {
    recoveryCode: recoveryResult.debugRecoveryCode,
    sessionCookie: createRequestCookie(signUpResult.headers),
    userId: signUpResult.response.user.id,
  };
}

function findSessionsByUserId(userId: string) {
  return db.query.accessSession.findMany({
    where: eq(accessSession.userId, userId),
  });
}

function createChangePasswordRequest(input: {
  password: string;
  cookie: string;
  requestUrl?: string;
}) {
  const formData = new FormData();
  formData.set("mode", "recovery");
  formData.set("newPassword", input.password);
  formData.set("confirmPassword", input.password);

  return new Request(input.requestUrl ?? RESET_PASSWORD_ACTION_URL, {
    method: "POST",
    body: formData,
    headers: {
      cookie: input.cookie,
    },
  });
}

async function expectThrownResponse(resultPromise: Promise<unknown>) {
  try {
    await resultPromise;
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    throw error;
  }

  throw new Error("Expected a response to be thrown.");
}

function createRequestCookie(headers: Headers) {
  const sessionCookie = readSetCookieValue(headers, /sb-access-token=([^;]+)/);

  if (!sessionCookie) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  return `sb-access-token=${sessionCookie}`;
}

function createRecoveryCookie(headers: Headers) {
  const recoveryCookie = readSetCookieValue(
    headers,
    /sb-recovery-user=([^;]+)/,
  );

  if (!recoveryCookie) {
    throw new Error(
      "Expected recovery exchange to return a test recovery cookie.",
    );
  }

  return `sb-recovery-user=${recoveryCookie}`;
}

function readSetCookieValue(headers: Headers, pattern: RegExp) {
  return headers.get("set-cookie")?.match(pattern)?.[1] ?? null;
}

import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { accessSession, user } from "@/db/schema";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import {
  ACCESS_SESSION_EXPIRES_IN_SECONDS,
  ACCESS_SESSION_UPDATE_AGE_SECONDS,
  createAccessRequestCookie,
  createAccessUser,
  readAccessSession,
} from "@/lib/auth/access-auth.test-support";
import { createInternalUser } from "@/lib/admin/users/internal-user-create.server";
import { action as signInAction } from "@/routes/ingresar";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

const ACCESS_SESSION_TTL_MS = ACCESS_SESSION_EXPIRES_IN_SECONDS * 1000;
const ACCESS_SESSION_UPDATE_AGE_MS = ACCESS_SESSION_UPDATE_AGE_SECONDS * 1000;

installDatabaseTestHooks();

describe("access session policy", () => {
  test("creates access sessions with an 8-hour inactivity lifetime", async () => {
    const beforeSignUp = Date.now();

    const signUpResult = await createAccessUser({
      email: "sesion@example.com",
      name: "sesion@example.com",
      password: "password-segura",
    });

    const createdSession = await findSessionByUserId(
      signUpResult.response.user.id,
    );

    expectSessionExpiresInPolicyWindow(createdSession.expiresAt, beforeSignUp);
  });

  test("refreshes access sessions only after 30 minutes of activity age", async () => {
    const { headers, userId } = await createVerifiedCredentialUser(
      "refresh@example.com",
    );
    const createdSession = await findSessionByUserId(userId);
    const sessionToken = createdSession.token;

    const justBeforeThreshold = new Date(
      Date.now() + ACCESS_SESSION_TTL_MS - ACCESS_SESSION_UPDATE_AGE_MS + 1_000,
    );
    await db
      .update(accessSession)
      .set({ expiresAt: justBeforeThreshold })
      .where(eq(accessSession.token, sessionToken));

    await readAccessSession(
      new Headers({ cookie: createAccessRequestCookie(headers) }),
    );

    const unrefreshedSession = await findSessionByToken(sessionToken);
    expect(unrefreshedSession.expiresAt.getTime()).toBe(
      justBeforeThreshold.getTime(),
    );

    const justAfterThreshold = new Date(
      Date.now() + ACCESS_SESSION_TTL_MS - ACCESS_SESSION_UPDATE_AGE_MS - 1_000,
    );
    await db
      .update(accessSession)
      .set({ expiresAt: justAfterThreshold })
      .where(eq(accessSession.token, sessionToken));

    await readAccessSession(
      new Headers({ cookie: createAccessRequestCookie(headers) }),
    );

    const refreshedSession = await findSessionByToken(sessionToken);
    expect(refreshedSession.userId).toBe(userId);
    expect(refreshedSession.expiresAt.getTime()).toBeGreaterThan(
      justAfterThreshold.getTime(),
    );
    expectSessionExpiresInPolicyWindow(refreshedSession.expiresAt, Date.now());
  });

  test("login-created sessions use the base policy without limiting simultaneous sessions", async () => {
    const loginEmail = "login@example.com";
    const { userId } = await createVerifiedCredentialUser(loginEmail);

    await db.delete(accessSession).where(eq(accessSession.userId, userId));

    const firstLoginStartedAt = Date.now();
    const firstLoginResponse = await expectThrownResponse(
      submitSignInAction(loginEmail),
    );
    const secondLoginStartedAt = Date.now();
    const secondLoginResponse = await expectThrownResponse(
      submitSignInAction(loginEmail),
    );

    expectResponseToSetSessionCookie(firstLoginResponse);
    expectResponseToSetSessionCookie(secondLoginResponse);

    const loginSessions = await db.query.accessSession.findMany({
      where: eq(accessSession.userId, userId),
      orderBy: (sessions, { asc }) => asc(sessions.createdAt),
    });

    expect(loginSessions).toHaveLength(2);
    expectSessionExpiresInPolicyWindow(
      loginSessions[0]?.expiresAt,
      firstLoginStartedAt,
    );
    expectSessionExpiresInPolicyWindow(
      loginSessions[1]?.expiresAt,
      secondLoginStartedAt,
    );
  });

  test("public academy signup waits for confirmation before creating the local auth session", async () => {
    const registrationEmail = "registro-sesion@example.com";

    const signUpResult = await accessAuthProvider.startEmailSignUp({
      email: registrationEmail,
      password: "password-segura",
      redirectTo: "http://localhost/registro/confirmar",
      request: new Request("http://localhost/registro"),
    });

    const unconfirmedUser = await db.query.user.findFirst({
      columns: { id: true },
      where: eq(user.email, registrationEmail),
    });
    const unconfirmedSessions = await db.query.accessSession.findMany();

    expect(unconfirmedUser).toBeUndefined();
    expect(unconfirmedSessions).toEqual([]);

    const confirmationTokenHash = signUpResult.debugConfirmationTokenHash;

    expect(confirmationTokenHash).toEqual(expect.any(String));

    if (typeof confirmationTokenHash !== "string") {
      throw new Error("Expected debug confirmation token hash.");
    }

    const confirmationStartedAt = Date.now();
    const confirmationResult = await accessAuthProvider.confirmEmailOtp({
      request: new Request(
        `http://localhost/registro/confirmar?token_hash=${confirmationTokenHash}&type=signup`,
      ),
      tokenHash: confirmationTokenHash,
      type: "signup",
    });

    const confirmedUser = await db.query.user.findFirst({
      columns: { id: true },
      where: eq(user.email, registrationEmail),
    });

    expect(confirmedUser).toEqual({ id: expect.any(String) });
    expectHeadersToSetSessionCookie(confirmationResult.headers);

    if (!confirmedUser) {
      throw new Error("Expected confirmed user to exist.");
    }

    const registrationSession = await findSessionByUserId(confirmedUser.id);

    expectSessionExpiresInPolicyWindow(
      registrationSession.expiresAt,
      confirmationStartedAt,
    );
  });

  test("internal user sign-in sessions use the base policy", async () => {
    const [adminUser] = await db
      .insert(user)
      .values({
        email: "admin.sesion@example.com",
        name: "Admin Sesión",
        emailVerified: true,
        role: "admin",
      })
      .returning();

    if (!adminUser) {
      throw new Error("Expected admin user to be created.");
    }

    const created = await createInternalUser({
      name: "Auditor Sesión",
      internalUsername: "auditor.sesion",
      role: "auditor",
      password: "password-segura",
      createdByUserId: adminUser.id,
    });

    if (!created.ok) {
      throw new Error(`Expected internal user creation: ${created.error}`);
    }

    const loginStartedAt = Date.now();
    const loginResponse = await expectThrownResponse(
      submitSignInAction("auditor.sesion"),
    );

    expectResponseToSetSessionCookie(loginResponse);

    const internalSession = await findSessionByUserId(created.userId);

    expectSessionExpiresInPolicyWindow(
      internalSession.expiresAt,
      loginStartedAt,
    );
  });
});

async function createVerifiedCredentialUser(email: string) {
  const signUpResult = await createAccessUser({
    email,
    name: email,
    password: "password-segura",
  });

  await db
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.id, signUpResult.response.user.id));

  return {
    headers: signUpResult.headers,
    userId: signUpResult.response.user.id,
  };
}

async function findSessionByToken(sessionToken: string) {
  const savedSession = await db.query.accessSession.findFirst({
    where: eq(accessSession.token, sessionToken),
  });

  if (!savedSession) {
    throw new Error("Expected session to exist.");
  }

  return savedSession;
}

function createSignInRequest(identifier: string) {
  const formData = new FormData();
  formData.set("identifier", identifier);
  formData.set("password", "password-segura");

  return new Request("http://localhost/ingresar", {
    method: "POST",
    body: formData,
  });
}

function submitSignInAction(identifier: string) {
  return signInAction({
    url: new URL("http://localhost/ingresar"),
    pattern: "/ingresar",
    request: createSignInRequest(identifier),
    params: {},
    context: {},
  });
}

function expectSessionExpiresInPolicyWindow(
  expiresAt: Date | undefined,
  startedAt: number,
) {
  expect(expiresAt).toBeInstanceOf(Date);
  expect(expiresAt?.getTime()).toBeGreaterThanOrEqual(
    startedAt + ACCESS_SESSION_TTL_MS - 1_000,
  );
  expect(expiresAt?.getTime()).toBeLessThanOrEqual(
    Date.now() + ACCESS_SESSION_TTL_MS + 1_000,
  );
}

async function expectThrownResponse(resultPromise: Promise<unknown>) {
  try {
    await resultPromise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    return error as Response;
  }

  throw new Error("Expected a response to be thrown.");
}

function expectResponseToSetSessionCookie(response: Response) {
  expectHeadersToSetSessionCookie(response.headers);
}

function expectHeadersToSetSessionCookie(headers: Headers) {
  expect(headers.get("set-cookie")).toContain("better-auth.session_token");
}

async function findSessionByUserId(userId: string) {
  const savedSession = await db.query.accessSession.findFirst({
    where: eq(accessSession.userId, userId),
  });

  if (!savedSession) {
    throw new Error("Expected session to exist.");
  }

  return savedSession;
}

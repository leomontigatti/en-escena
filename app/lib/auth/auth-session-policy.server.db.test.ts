import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { accessSession, user } from "@/db/schema";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import {
  ACCESS_SESSION_EXPIRES_IN_SECONDS,
  ACCESS_SESSION_UPDATE_AGE_SECONDS,
  createLocalAccessRequestCookie,
  createLocalAccessUser,
  readLocalAccessSession,
} from "@/lib/auth/access-test-auth.server";
import {
  completeInternalUserInvitation,
  requestInternalUserInvitation,
} from "@/lib/admin/users/user-invitation.server";
import { action as signInAction } from "@/routes/ingresar";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

const ACCESS_SESSION_TTL_MS = ACCESS_SESSION_EXPIRES_IN_SECONDS * 1000;
const ACCESS_SESSION_UPDATE_AGE_MS = ACCESS_SESSION_UPDATE_AGE_SECONDS * 1000;

installDatabaseTestHooks();

describe("access session policy", () => {
  test("creates access sessions with an 8-hour inactivity lifetime", async () => {
    const beforeSignUp = Date.now();

    const signUpResult = await createLocalAccessUser({
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

    await readLocalAccessSession(
      new Headers({ cookie: createLocalAccessRequestCookie(headers) }),
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

    await readLocalAccessSession(
      new Headers({ cookie: createLocalAccessRequestCookie(headers) }),
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
      email: "registro-sesion@example.com",
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
    expect(signUpResult.debugConfirmationTokenHash).toEqual(expect.any(String));

    const confirmationStartedAt = Date.now();
    const confirmationResult = await accessAuthProvider.confirmEmailOtp({
      request: new Request(
        `http://localhost/registro/confirmar?token_hash=${signUpResult.debugConfirmationTokenHash}&type=signup`,
      ),
      tokenHash: signUpResult.debugConfirmationTokenHash!,
      type: "signup",
    });

    const confirmedUser = await db.query.user.findFirst({
      columns: { id: true },
      where: eq(user.email, registrationEmail),
    });

    expect(confirmedUser).toEqual({ id: expect.any(String) });
    expectHeadersToSetSessionCookie(confirmationResult.headers);

    const registrationSession = await findSessionByUserId(confirmedUser!.id);

    expectSessionExpiresInPolicyWindow(
      registrationSession.expiresAt,
      confirmationStartedAt,
    );
  });

  test("internal invitation sessions use the base policy", async () => {
    let invitationEmailText = "";

    await requestInternalUserInvitation(
      {
        email: "invitado-sesion@example.com",
        role: "auditor",
        requestUrl: "http://localhost/administracion/usuarios/nuevo",
      },
      {
        sendEmail: async (input) => {
          invitationEmailText = input.text;
        },
      },
    );

    const invitationToken = extractInvitationToken(invitationEmailText);

    const invitationStartedAt = Date.now();
    const result = await completeInternalUserInvitation({
      token: invitationToken,
      password: "password-segura",
      request: new Request(`http://localhost/invitacion/${invitationToken}`),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected invitation to complete.");
    }

    const invitationSession = await findSessionByUserId(result.userId);

    expectHeadersToSetSessionCookie(result.headers);
    expectSessionExpiresInPolicyWindow(
      invitationSession.expiresAt,
      invitationStartedAt,
    );
  });
});

async function createVerifiedCredentialUser(email: string) {
  const signUpResult = await createLocalAccessUser({
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

function createSignInRequest(email: string) {
  const formData = new FormData();
  formData.set("identifier", email);
  formData.set("password", "password-segura");

  return new Request("http://localhost/ingresar", {
    method: "POST",
    body: formData,
  });
}

function submitSignInAction(email: string) {
  return signInAction({
    url: new URL("http://localhost/ingresar"),
    pattern: "/ingresar",
    request: createSignInRequest(email),
    params: {},
    context: {},
  });
}

function extractInvitationToken(text: string) {
  const match = text.match(/\/invitacion\/([A-Za-z0-9_-]+)/);

  if (!match?.[1]) {
    throw new Error(`Invitation link was not found in email: ${text}`);
  }

  return match[1];
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
  expect(headers.get("set-cookie")).toContain("sb-access-token");
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

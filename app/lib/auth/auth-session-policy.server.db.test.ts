import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { session, user } from "@/db/schema";
import { signUpAcademyUser } from "@/lib/academies/registration-auth.server";
import {
  ACCESS_SESSION_EXPIRES_IN_SECONDS,
  ACCESS_SESSION_UPDATE_AGE_SECONDS,
  auth,
} from "@/lib/auth/auth.server";
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

    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: "sesion@example.com",
        name: "sesion@example.com",
        password: "password-segura",
      },
      returnHeaders: true,
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
      .update(session)
      .set({ expiresAt: justBeforeThreshold })
      .where(eq(session.token, sessionToken));

    await auth.api.getSession({
      headers: new Headers({ cookie: createRequestCookie(headers) }),
    });

    const unrefreshedSession = await findSessionByToken(sessionToken);
    expect(unrefreshedSession.expiresAt.getTime()).toBe(
      justBeforeThreshold.getTime(),
    );

    const justAfterThreshold = new Date(
      Date.now() + ACCESS_SESSION_TTL_MS - ACCESS_SESSION_UPDATE_AGE_MS - 1_000,
    );
    await db
      .update(session)
      .set({ expiresAt: justAfterThreshold })
      .where(eq(session.token, sessionToken));

    await auth.api.getSession({
      headers: new Headers({ cookie: createRequestCookie(headers) }),
    });

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

    await db.delete(session).where(eq(session.userId, userId));

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

    const loginSessions = await db.query.session.findMany({
      where: eq(session.userId, userId),
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

  test("public academy registration sessions use the base policy", async () => {
    const registrationStartedAt = Date.now();

    const result = await signUpAcademyUser({
      email: "registro-sesion@example.com",
      password: "password-segura",
      request: new Request("http://localhost/registro/token"),
    });

    const registrationSession = await findSessionByUserId(result.userId);

    expectHeadersToSetSessionCookie(result.headers);
    expectSessionExpiresInPolicyWindow(
      registrationSession.expiresAt,
      registrationStartedAt,
    );
  });

  test("internal invitation sessions use the base policy", async () => {
    let invitationEmailText = "";

    await requestInternalUserInvitation(
      {
        email: "invitado-sesion@example.com",
        role: "auditor",
        requestUrl: "http://localhost/administracion/usuarios/invitaciones",
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
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email,
      name: email,
      password: "password-segura",
    },
    returnHeaders: true,
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
  const savedSession = await db.query.session.findFirst({
    where: eq(session.token, sessionToken),
  });

  if (!savedSession) {
    throw new Error("Expected session to exist.");
  }

  return savedSession;
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");
  const sessionCookie = setCookie?.match(/better-auth\.session_token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  return `better-auth.session_token=${sessionCookie[1]}`;
}

function createSignInRequest(email: string) {
  const formData = new FormData();
  formData.set("email", email);
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
  expect(headers.get("set-cookie")).toContain("better-auth.session_token");
}

async function findSessionByUserId(userId: string) {
  const savedSession = await db.query.session.findFirst({
    where: eq(session.userId, userId),
  });

  if (!savedSession) {
    throw new Error("Expected session to exist.");
  }

  return savedSession;
}

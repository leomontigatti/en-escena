import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { session, user } from "@/db/schema";
import { auth } from "@/lib/auth.server";
import { action as signInAction } from "@/routes/ingresar";
import { action as logoutAction, loader as logoutLoader } from "@/routes/salir";

import { installDatabaseTestHooks } from "../../tests/db/harness";

installDatabaseTestHooks();

describe("logout route", () => {
  test("POST revokes only the current session and redirects to login", async () => {
    const { headers: currentSessionHeaders, userId } =
      await createVerifiedCredentialUser("salir@example.com");
    const otherSessionResponse = await expectThrownResponse(
      submitSignInAction("salir@example.com"),
      302,
    );
    const otherSessionHeaders = otherSessionResponse.headers;
    const currentSessionToken = extractDatabaseSessionToken(
      currentSessionHeaders,
    );
    const otherSessionToken = extractDatabaseSessionToken(otherSessionHeaders);

    const response = await expectThrownResponse(
      logoutAction({
        url: new URL("http://localhost/salir"),
        pattern: "/salir",
        request: new Request("http://localhost/salir", {
          method: "POST",
          headers: {
            cookie: createRequestCookie(currentSessionHeaders),
          },
        }),
        params: {},
        context: {},
      }),
      302,
    );

    expect(response.headers.get("location")).toBe("/ingresar?sesion=cerrada");
    expect(response.headers.get("set-cookie")).toContain(
      "better-auth.session_token=",
    );

    const savedSessions = await db.query.session.findMany({
      where: eq(session.userId, userId),
    });

    expect(savedSessions.map((savedSession) => savedSession.token)).toEqual([
      otherSessionToken,
    ]);
    expect(savedSessions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ token: currentSessionToken }),
      ]),
    );
  });

  test("GET does not revoke the current session", async () => {
    const { headers, userId } = await createVerifiedCredentialUser(
      "salir-get@example.com",
    );
    const sessionToken = extractDatabaseSessionToken(headers);

    const response = await expectThrownResponse(logoutLoader(), 302);

    expect(response.headers.get("location")).toBe("/ingresar");

    const savedSessions = await db.query.session.findMany({
      where: eq(session.userId, userId),
    });

    expect(savedSessions.map((savedSession) => savedSession.token)).toEqual([
      sessionToken,
    ]);
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

function createRequestCookie(headers: Headers) {
  return `better-auth.session_token=${extractSignedSessionCookie(headers)}`;
}

function extractDatabaseSessionToken(headers: Headers) {
  return extractSignedSessionCookie(headers).split(".")[0] ?? "";
}

function extractSignedSessionCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");
  const sessionCookie = setCookie?.match(/better-auth\.session_token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  return sessionCookie[1];
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

async function expectThrownResponse(
  resultPromise: Promise<unknown>,
  status: number,
) {
  try {
    await resultPromise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(status);
    return error as Response;
  }

  throw new Error("Expected a response to be thrown.");
}

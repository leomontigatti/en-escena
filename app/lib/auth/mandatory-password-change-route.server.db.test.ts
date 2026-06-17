import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { session, user } from "@/db/schema";
import { auth } from "@/lib/auth/auth.server";
import { action as changePasswordAction } from "@/routes/cambiar-contrasena";
import { action as signInAction } from "@/routes/ingresar";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("mandatory password change route", () => {
  test("clears the mandatory state, revokes other sessions and redirects to the role landing path", async () => {
    const { userId, currentSessionHeaders } = await createInternalSessionState({
      email: "cambio-obligatorio@example.com",
      role: "admin",
      internalUsername: "cambio.admin",
      password: "password-segura",
    });

    const otherSessionResponse = await expectThrownResponse(
      submitSignInAction("cambio.admin", "password-segura"),
      302,
    );

    const response = await expectThrownResponse(
      changePasswordAction({
        url: new URL("http://localhost/cambiar-contrasena"),
        pattern: "/cambiar-contrasena",
        request: createChangePasswordRequest({
          currentPassword: "password-segura",
          newPassword: "password-nueva",
          headers: currentSessionHeaders,
        }),
        params: {},
        context: {},
      }),
      302,
    );

    expect(response.headers.get("location")).toBe("/administracion");

    const savedUser = await db.query.user.findFirst({
      columns: { requiresPasswordChange: true },
      where: eq(user.id, userId),
    });
    expect(savedUser?.requiresPasswordChange).toBe(false);

    const remainingSessions = await db.query.session.findMany({
      where: eq(session.userId, userId),
    });
    expect(remainingSessions).toHaveLength(1);
    expect(remainingSessions[0]?.token).toBe(
      extractDatabaseSessionToken(currentSessionHeaders),
    );
    expect(remainingSessions[0]?.token).not.toBe(
      extractDatabaseSessionToken(otherSessionResponse.headers),
    );

    const signInWithOldPassword = await signInAction({
      url: new URL("http://localhost/ingresar"),
      pattern: "/ingresar",
      request: createSignInRequest({
        identifier: "cambio.admin",
        password: "password-segura",
      }),
      params: {},
      context: {},
    });

    expect(signInWithOldPassword).toMatchObject({
      status: "error",
      message: "No pudimos ingresar con esos datos.",
    });

    const signInWithNewPassword = await expectThrownResponse(
      submitSignInAction("cambio.admin", "password-nueva"),
      302,
    );
    expect(signInWithNewPassword.headers.get("location")).toBe(
      "/administracion",
    );
  });
});

async function createInternalSessionState(input: {
  email: string;
  role: "admin" | "auditor" | "judge";
  internalUsername: string;
  password: string;
}) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: input.email,
      name: input.email,
      password: input.password,
    },
    returnHeaders: true,
  });

  await db
    .update(user)
    .set({
      role: input.role,
      internalUsername: input.internalUsername,
      requiresPasswordChange: true,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  const currentSessionResponse = await expectThrownResponse(
    submitSignInAction(input.internalUsername, input.password),
    302,
  );

  return {
    userId: signUpResult.response.user.id,
    currentSessionHeaders: currentSessionResponse.headers,
  };
}

function createChangePasswordRequest(input: {
  currentPassword: string;
  newPassword: string;
  headers: Headers;
}) {
  const formData = new FormData();
  formData.set("currentPassword", input.currentPassword);
  formData.set("newPassword", input.newPassword);
  formData.set("confirmPassword", input.newPassword);

  return new Request("http://localhost/cambiar-contrasena", {
    method: "POST",
    body: formData,
    headers: {
      cookie: createRequestCookie(input.headers),
    },
  });
}

function submitSignInAction(identifier: string, password: string) {
  return signInAction({
    url: new URL("http://localhost/ingresar"),
    pattern: "/ingresar",
    request: createSignInRequest({
      identifier,
      password,
    }),
    params: {},
    context: {},
  });
}

function createSignInRequest(input: { identifier: string; password: string }) {
  const formData = new FormData();
  formData.set("identifier", input.identifier);
  formData.set("password", input.password);

  return new Request("http://localhost/ingresar", {
    method: "POST",
    body: formData,
  });
}

function createRequestCookie(headers: Headers) {
  return `sb-access-token=${extractSignedSessionCookie(headers)}`;
}

function extractDatabaseSessionToken(headers: Headers) {
  return extractSignedSessionCookie(headers).split(".")[0] ?? "";
}

function extractSignedSessionCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");
  const sessionCookie = setCookie?.match(/sb-access-token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error(
      "Expected access auth to return a Supabase session cookie.",
    );
  }

  return sessionCookie[1];
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

import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth/auth.server";
import {
  action,
  internalInvitationRedirectPath,
  loader,
} from "@/routes/administracion.usuarios_.invitaciones";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion/usuarios/invitaciones route", () => {
  test("redirects administrators to direct internal user creation", async () => {
    const { request: loaderRequest } = await createSignedInRequest({
      email: "admin.invitaciones.loader@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios/invitaciones",
    });
    const { request: actionRequest } = await createSignedInRequest({
      email: "admin.invitaciones.action@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios/invitaciones",
      body: new FormData(),
    });

    const loaderResponse = await expectThrownResponse(
      loader(routeArgs(loaderRequest)),
      302,
    );
    const actionResponse = await expectThrownResponse(
      action(routeArgs(actionRequest)),
      302,
    );

    expect(loaderResponse.headers.get("location")).toBe(
      internalInvitationRedirectPath,
    );
    expect(actionResponse.headers.get("location")).toBe(
      internalInvitationRedirectPath,
    );
  });
});

async function createSignedInRequest(input: {
  email: string;
  role: "admin" | "auditor" | "judge" | "academy";
  requestUrl: string;
  body?: FormData;
}) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: input.email,
      name: input.email,
      password: "password-segura",
    },
    returnHeaders: true,
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: input.role,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  return {
    request: new Request(input.requestUrl, {
      method: input.body ? "POST" : "GET",
      body: input.body,
      headers: {
        cookie: createRequestCookie(signUpResult.headers),
      },
    }),
  };
}

function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/usuarios/invitaciones",
  };
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  return setCookie.split(";")[0] ?? "";
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

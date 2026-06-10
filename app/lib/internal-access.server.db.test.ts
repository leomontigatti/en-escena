import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { auth } from "@/lib/auth.server";
import {
  requireAcademyUser,
  requireAdminUser,
  requireInternalUser,
  requireSignedInUser,
} from "@/lib/internal-access.server";
import type { InternalUserRole } from "@/lib/internal-user-roles";

import { installDatabaseTestHooks } from "../../tests/db/harness";

installDatabaseTestHooks();

describe("internal access authorization", () => {
  test("redirects missing sessions to login", async () => {
    const response = await expectThrownResponse(
      requireSignedInUser(new Request("http://localhost/portal")),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/ingresar");
  });

  test("requires a signed-in user stored in the app domain", async () => {
    const { request, userId } = await createSignedInRequest({
      email: "firmado@example.com",
      role: "auditor",
    });

    await expect(requireSignedInUser(request)).resolves.toMatchObject({
      id: userId,
      email: "firmado@example.com",
      role: "auditor",
    });
  });

  test("returns the academy owned by an academy user", async () => {
    const { request, userId } = await createSignedInRequest({
      email: "academia@example.com",
      role: "academy",
    });

    await db.insert(academies).values({
      id: "academy_owned",
      userId,
      name: "Academia Propia",
      contactName: "Contacto",
      phone: "11 1234-5678",
    });

    await expect(requireAcademyUser(request)).resolves.toMatchObject({
      user: {
        id: userId,
        email: "academia@example.com",
        role: "academy",
      },
      academy: {
        id: "academy_owned",
        userId,
        name: "Academia Propia",
      },
    });
  });

  test("rejects internal users from academy-owned context", async () => {
    const { request } = await createSignedInRequest({
      email: "admin@example.com",
      role: "admin",
    });

    const response = await expectThrownResponse(requireAcademyUser(request));

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe(
      "Los usuarios internos no pueden acceder al portal.",
    );
  });

  test("allows only requested internal roles", async () => {
    const { request: judgeRequest, userId } = await createSignedInRequest({
      email: "judge@example.com",
      role: "judge",
    });

    await expect(
      requireInternalUser(judgeRequest, ["judge"]),
    ).resolves.toMatchObject({
      id: userId,
      role: "judge",
    });

    const auditorResponse = await expectThrownResponse(
      requireAdminUser(judgeRequest),
    );

    expect(auditorResponse.status).toBe(403);
  });

  test("rejects academy users from internal context", async () => {
    const { request } = await createSignedInRequest({
      email: "academia@example.com",
      role: "academy",
    });

    const response = await expectThrownResponse(requireInternalUser(request));

    expect(response.status).toBe(403);
  });
});

async function createSignedInRequest(input: {
  email: string;
  role: "academy" | InternalUserRole;
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
    request: new Request("http://localhost/protected", {
      headers: {
        cookie: createRequestCookie(signUpResult.headers),
      },
    }),
    userId: signUpResult.response.user.id,
  };
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  return setCookie.split(";")[0] ?? "";
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

import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { auth } from "@/lib/auth.server";
import {
  getLandingPathForSignedInUser,
  requireAdminPanelUser,
  requireAuditorPanelUser,
  requireJudgePanelUser,
} from "@/lib/internal-navigation.server";
import type { InternalUserRole } from "@/lib/internal-user-roles";
import { action as signInAction } from "@/routes/ingresar";

import { installDatabaseTestHooks } from "../../tests/db/harness";

installDatabaseTestHooks();

describe("internal navigation", () => {
  test.each([
    ["academy", "/portal"],
    ["admin", "/administracion"],
    ["auditor", "/auditoria"],
    ["judge", "/juzgamiento"],
  ] as const)(
    "lands %s users on the role-specific surface",
    async (role, path) => {
      const { request } = await createSignedInRequest({
        email: `${role}@example.com`,
        role,
      });

      await expect(getLandingPathForSignedInUser(request)).resolves.toBe(path);
    },
  );

  test("allows administrators to reach the admin panel but blocks other internal roles", async () => {
    const { request: adminRequest } = await createSignedInRequest({
      email: "admin@example.com",
      role: "admin",
    });
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor@example.com",
      role: "auditor",
    });
    const { request: judgeRequest } = await createSignedInRequest({
      email: "judge@example.com",
      role: "judge",
    });

    await expect(requireAdminPanelUser(adminRequest)).resolves.toMatchObject({
      role: "admin",
    });

    await expectThrownResponse(requireAdminPanelUser(auditorRequest), 403);
    await expectThrownResponse(requireAdminPanelUser(judgeRequest), 403);
  });

  test("redirects administrators to the admin panel after login", async () => {
    await createCredentialUser({
      email: "admin.login@example.com",
      role: "admin",
    });

    const response = await expectThrownResponse(
      signInAction({
        url: new URL("http://localhost/ingresar"),
        pattern: "/ingresar",
        request: createSignInRequest({
          email: "admin.login@example.com",
          password: "password-segura",
        }),
        params: {},
        context: {},
      }),
      302,
    );

    expect(response.headers.get("location")).toBe("/administracion");
    expect(response.headers.get("set-cookie")).toContain(
      "better-auth.session_token",
    );
  });

  test("keeps auditor and judge placeholders separate from mutation surfaces", async () => {
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditoria@example.com",
      role: "auditor",
    });
    const { request: judgeRequest } = await createSignedInRequest({
      email: "juzgamiento@example.com",
      role: "judge",
    });

    await expect(
      requireAuditorPanelUser(auditorRequest),
    ).resolves.toMatchObject({
      role: "auditor",
    });
    await expect(requireJudgePanelUser(judgeRequest)).resolves.toMatchObject({
      role: "judge",
    });

    await expectThrownResponse(requireJudgePanelUser(auditorRequest), 403);
    await expectThrownResponse(requireAuditorPanelUser(judgeRequest), 403);
  });
});

async function createSignedInRequest(input: {
  email: string;
  role: "academy" | InternalUserRole;
}) {
  const credentialUser = await createCredentialUser(input);

  if (input.role === "academy") {
    await db.insert(academies).values({
      id: `academy_${credentialUser.userId}`,
      userId: credentialUser.userId,
      name: "Academia de Prueba",
      contactName: "Contacto",
      phone: "11 1234-5678",
    });
  }

  return {
    request: new Request("http://localhost/protected", {
      headers: {
        cookie: createRequestCookie(credentialUser.headers),
      },
    }),
  };
}

async function createCredentialUser(input: {
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
    headers: signUpResult.headers,
    userId: signUpResult.response.user.id,
  };
}

function createSignInRequest(input: { email: string; password: string }) {
  const formData = new FormData();
  formData.set("email", input.email);
  formData.set("password", input.password);

  return new Request("http://localhost/ingresar", {
    method: "POST",
    body: formData,
  });
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected Better Auth to return a session cookie.");
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

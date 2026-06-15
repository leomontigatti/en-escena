import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { auth } from "@/lib/auth/auth.server";
import {
  getLandingPathForSignedInUser,
  requireAdminPanelUser,
  requireAuditorPanelUser,
  requireJudgePanelUser,
} from "@/lib/auth/internal-navigation.server";
import type { InternalUserRole } from "@/lib/auth/internal-user-roles";
import {
  action as signInAction,
  loader as signInLoader,
} from "@/routes/ingresar";
import { loader as recoveryLoader } from "@/routes/recuperar-acceso";
import { loader as registrationLoader } from "@/routes/registro";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

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
          identifier: "admin.login@example.com",
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

  test("authenticates internal users with nombre de usuario interno and redirects mandatory changes", async () => {
    await createCredentialUser({
      email: "admin.interno@example.com",
      role: "admin",
      internalUsername: "admin.interno",
      requiresPasswordChange: true,
    });

    const response = await expectThrownResponse(
      signInAction({
        url: new URL("http://localhost/ingresar"),
        pattern: "/ingresar",
        request: createSignInRequest({
          identifier: "Admin.Interno",
          password: "password-segura",
        }),
        params: {},
        context: {},
      }),
      302,
    );

    expect(response.headers.get("location")).toBe("/cambiar-contrasena");
    expect(response.headers.get("set-cookie")).toContain(
      "better-auth.session_token",
    );
  });

  test("rejects unverified users with the generic login error", async () => {
    await auth.api.signUpEmail({
      body: {
        email: "sin-verificar@example.com",
        name: "sin-verificar@example.com",
        password: "password-segura",
      },
    });

    await expect(
      signInAction({
        url: new URL("http://localhost/ingresar"),
        pattern: "/ingresar",
        request: createSignInRequest({
          identifier: "sin-verificar@example.com",
          password: "password-segura",
        }),
        params: {},
        context: {},
      }),
    ).resolves.toEqual({
      status: "error",
      message: "No pudimos ingresar con esos datos.",
      fieldErrors: {
        identifier: undefined,
        password: undefined,
      },
    });
  });

  test("returns users to a safe private destination after login", async () => {
    await createCredentialUser({
      email: "redirect.login@example.com",
      role: "admin",
    });

    const response = await expectThrownResponse(
      signInAction({
        url: new URL(
          "http://localhost/ingresar?redirectTo=%2Fadministracion%2Fusuarios%2Finvitaciones%3Festado%3Dpendiente",
        ),
        pattern: "/ingresar",
        request: createSignInRequest({
          identifier: "redirect.login@example.com",
          password: "password-segura",
          requestUrl:
            "http://localhost/ingresar?redirectTo=%2Fadministracion%2Fusuarios%2Finvitaciones%3Festado%3Dpendiente",
        }),
        params: {},
        context: {},
      }),
      302,
    );

    expect(response.headers.get("location")).toBe(
      "/administracion/usuarios/invitaciones?estado=pendiente",
    );
  });

  test.each([
    ["absolute", "https://example.com/phishing"],
    ["protocol-relative", "//example.com/phishing"],
  ])("ignores %s redirect targets after login", async (prefix, redirectTo) => {
    const email = `unsafe-${prefix}@example.com`;

    await createCredentialUser({
      email,
      role: "auditor",
    });

    const requestUrl = `http://localhost/ingresar?redirectTo=${encodeURIComponent(redirectTo)}`;
    const response = await expectThrownResponse(
      signInAction({
        url: new URL(requestUrl),
        pattern: "/ingresar",
        request: createSignInRequest({
          identifier: email,
          password: "password-segura",
          requestUrl,
        }),
        params: {},
        context: {},
      }),
      302,
    );

    expect(response.headers.get("location")).toBe("/auditoria");
  });

  test.each([
    ["login", signInLoader, "http://localhost/ingresar", "/ingresar"],
    [
      "registration request",
      registrationLoader,
      "http://localhost/registro",
      "/registro",
    ],
    [
      "access recovery",
      recoveryLoader,
      "http://localhost/recuperar-acceso",
      "/recuperar-acceso",
    ],
  ] as const)(
    "redirects signed-in users away from the public %s page",
    async (_name, loader, requestUrl, pattern) => {
      const { request } = await createSignedInRequest({
        email: `${_name.replace(/\s/g, "-")}@example.com`,
        role: "judge",
        requestUrl,
      });

      const response = await expectThrownResponse(
        loader({
          request,
          params: {},
          context: {},
          url: new URL(requestUrl),
          pattern,
        }),
        302,
      );

      expect(response.headers.get("location")).toBe("/juzgamiento");
    },
  );

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
  requestUrl?: string;
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
    request: new Request(input.requestUrl ?? "http://localhost/protected", {
      headers: {
        cookie: createRequestCookie(credentialUser.headers),
      },
    }),
  };
}

async function createCredentialUser(input: {
  email: string;
  role: "academy" | InternalUserRole;
  internalUsername?: string;
  requiresPasswordChange?: boolean;
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
      internalUsername: input.internalUsername,
      requiresPasswordChange: input.requiresPasswordChange,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  return {
    headers: signUpResult.headers,
    userId: signUpResult.response.user.id,
  };
}

function createSignInRequest(input: {
  identifier: string;
  password: string;
  requestUrl?: string;
}) {
  const formData = new FormData();
  formData.set("identifier", input.identifier);
  formData.set("password", input.password);

  return new Request(input.requestUrl ?? "http://localhost/ingresar", {
    method: "POST",
    body: formData,
  });
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  const sessionCookie = setCookie.match(/better-auth\.session_token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  return `better-auth.session_token=${sessionCookie[1]}`;
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

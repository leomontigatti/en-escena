import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
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
import { loader as indexLoader } from "@/routes/_index";
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
    expect(response.headers.get("set-cookie")).toContain("sb-access-token");
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
    expect(response.headers.get("set-cookie")).toContain("sb-access-token");
  });

  test("rejects unverified users with the generic login error", async () => {
    await createLocalAccessUser({
      email: "sin-verificar@example.com",
      name: "sin-verificar@example.com",
      password: "password-segura",
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
      values: {
        identifier: "sin-verificar@example.com",
        password: "",
      },
    });
  });

  test("rejects suspended users with the generic login error", async () => {
    const { userId } = await createCredentialUser({
      email: "suspendido.login@example.com",
      role: "admin",
    });

    await db.update(user).set({ suspended: true }).where(eq(user.id, userId));

    await expect(
      signInAction({
        url: new URL("http://localhost/ingresar"),
        pattern: "/ingresar",
        request: createSignInRequest({
          identifier: "suspendido.login@example.com",
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
      values: {
        identifier: "suspendido.login@example.com",
        password: "",
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
          "http://localhost/ingresar?redirectTo=%2Fadministracion%2Fusuarios%2Fnuevo%3Fnotificacion%3Dusuario-interno-creado",
        ),
        pattern: "/ingresar",
        request: createSignInRequest({
          identifier: "redirect.login@example.com",
          password: "password-segura",
          requestUrl:
            "http://localhost/ingresar?redirectTo=%2Fadministracion%2Fusuarios%2Fnuevo%3Fnotificacion%3Dusuario-interno-creado",
        }),
        params: {},
        context: {},
      }),
      302,
    );

    expect(response.headers.get("location")).toBe(
      "/administracion/usuarios/nuevo?notificacion=usuario-interno-creado",
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

  test("redirects visitors from / to ingresar", async () => {
    const response = await expectThrownResponse(
      indexLoader({
        request: new Request("http://localhost/"),
        params: {},
        context: {},
        url: new URL("http://localhost/"),
        pattern: "/",
      }),
      302,
    );

    expect(response.headers.get("location")).toBe("/ingresar");
  });

  test.each([
    ["academy", "/portal"],
    ["admin", "/administracion"],
    ["auditor", "/auditoria"],
    ["judge", "/juzgamiento"],
  ] as const)(
    "redirects signed-in %s users from / to their landing route",
    async (role, path) => {
      const { request } = await createSignedInRequest({
        email: `index-${role}@example.com`,
        role,
        requestUrl: "http://localhost/",
      });

      const response = await expectThrownResponse(
        indexLoader({
          request,
          params: {},
          context: {},
          url: new URL("http://localhost/"),
          pattern: "/",
        }),
        302,
      );

      expect(response.headers.get("location")).toBe(path);
    },
  );

  test("routes academy users without an Academia to onboarding after login", async () => {
    const { request } = await createSignedInRequest({
      email: "registro.pendiente@example.com",
      role: "academy",
      requestUrl: "http://localhost/registro",
      withAcademy: false,
    });

    const response = await expectThrownResponse(
      registrationLoader({
        request,
        params: {},
        context: {},
        url: new URL("http://localhost/registro"),
        pattern: "/registro",
      }),
      302,
    );

    expect(response.headers.get("location")).toBe("/registro/academia");
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
  requestUrl?: string;
  withAcademy?: boolean;
}) {
  const credentialUser = await createCredentialUser(input);

  if (input.role === "academy" && input.withAcademy !== false) {
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
        cookie: createRequestCookie(
          (
            await accessAuthProvider.signInCredentialUser({
              email: input.email,
              password: "password-segura",
              request: new Request("http://localhost/ingresar", {
                method: "POST",
              }),
            })
          ).headers,
        ),
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
  const signUpResult = await createLocalAccessUser({
    email: input.email,
    name: input.email,
    password: "password-segura",
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
    throw new Error("Expected access auth to return a session cookie.");
  }

  const sessionCookie = setCookie.match(/sb-access-token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error(
      "Expected access auth to return a Supabase session cookie.",
    );
  }

  return `sb-access-token=${sessionCookie[1]}`;
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

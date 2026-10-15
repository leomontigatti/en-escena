import { eq } from "drizzle-orm";
import { RouterContextProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { academies, user } from "@/db/schema";
import {
  requireAdminPanelReader,
  requireAdminPanelWriter,
  requireJudgePanelUser,
} from "@/lib/auth/internal-access.server";
import { createAccessUser } from "@/lib/auth/access-auth.test-support";
import { getLandingPathForSignedInUser } from "@/lib/auth/internal-navigation.server";
import type { UserRole } from "@/lib/auth/user-role.shared";
import { expectThrownResponse } from "@/lib/test-support/http";
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
    ["auditor", "/administracion"],
    ["judge", "/juzgamiento"],
  ] as const)(
    "lands %s users on the role-specific surface",
    async (role, path) => {
      const { request } = await createSignedInNavigationRequest({
        email: `${role}@example.com`,
        role,
      });

      await expect(getLandingPathForSignedInUser(request)).resolves.toBe(path);
    },
  );

  test("allows administrators to reach the admin panel but blocks other internal roles", async () => {
    const { request: adminRequest } = await createSignedInNavigationRequest({
      email: "admin@example.com",
      role: "admin",
    });
    const { request: auditorRequest } = await createSignedInNavigationRequest({
      email: "auditor@example.com",
      role: "auditor",
    });
    const { request: judgeRequest } = await createSignedInNavigationRequest({
      email: "judge@example.com",
      role: "judge",
    });

    await expect(requireAdminPanelWriter(adminRequest)).resolves.toMatchObject({
      role: "admin",
    });

    await expectThrownResponse(requireAdminPanelWriter(auditorRequest), 403);
    await expectThrownResponse(requireAdminPanelWriter(judgeRequest), 403);
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
        context: new RouterContextProvider(),
      }),
      302,
    );

    expect(response.headers.get("location")).toBe("/administracion");
    expect(response.headers.get("set-cookie")).toContain(
      "better-auth.session_token",
    );
  });

  test("authenticates internal users with internal username and lands them on their role path", async () => {
    await createCredentialUser({
      email: "admin.interno@example.com",
      role: "admin",
      internalUsername: "admin.interno",
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
        context: new RouterContextProvider(),
      }),
      302,
    );

    expect(response.headers.get("location")).toBe("/administracion");
    expect(response.headers.get("set-cookie")).toContain(
      "better-auth.session_token",
    );
  });

  test("rejects unverified users with the generic login error", async () => {
    await createAccessUser({
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
        context: new RouterContextProvider(),
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
        context: new RouterContextProvider(),
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
          "http://localhost/ingresar?redirectTo=%2Fadministracion%2Fusuarios%2Fnuevo%3Fquery%3Dada",
        ),
        pattern: "/ingresar",
        request: createSignInRequest({
          identifier: "redirect.login@example.com",
          password: "password-segura",
          requestUrl:
            "http://localhost/ingresar?redirectTo=%2Fadministracion%2Fusuarios%2Fnuevo%3Fquery%3Dada",
        }),
        params: {},
        context: new RouterContextProvider(),
      }),
      302,
    );

    expect(response.headers.get("location")).toBe(
      "/administracion/usuarios/nuevo?query=ada",
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
        context: new RouterContextProvider(),
      }),
      302,
    );

    expect(response.headers.get("location")).toBe("/administracion");
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
      const { request } = await createSignedInNavigationRequest({
        email: `${_name.replace(/\s/g, "-")}@example.com`,
        role: "judge",
        requestUrl,
      });

      const response = await expectThrownResponse(
        loader({
          request,
          params: {},
          context: new RouterContextProvider(),
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
        context: new RouterContextProvider(),
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
    ["auditor", "/administracion"],
    ["judge", "/juzgamiento"],
  ] as const)(
    "redirects signed-in %s users from / to their landing route",
    async (role, path) => {
      const { request } = await createSignedInNavigationRequest({
        email: `index-${role}@example.com`,
        role,
        requestUrl: "http://localhost/",
      });

      const response = await expectThrownResponse(
        indexLoader({
          request,
          params: {},
          context: new RouterContextProvider(),
          url: new URL("http://localhost/"),
          pattern: "/",
        }),
        302,
      );

      expect(response.headers.get("location")).toBe(path);
    },
  );

  test("routes academy users without an academy to onboarding after login", async () => {
    const { request } = await createSignedInNavigationRequest({
      email: "registro.pendiente@example.com",
      role: "academy",
      requestUrl: "http://localhost/registro",
      withAcademy: false,
    });

    const response = await expectThrownResponse(
      registrationLoader({
        request,
        params: {},
        context: new RouterContextProvider(),
        url: new URL("http://localhost/registro"),
        pattern: "/registro",
      }),
      302,
    );

    expect(response.headers.get("location")).toBe("/registro/cuenta");
  });

  test("admits administration readers to the panel and nobody else", async () => {
    const { request: auditorRequest } = await createSignedInNavigationRequest({
      email: "auditoria@example.com",
      role: "auditor",
    });
    const { request: judgeRequest } = await createSignedInNavigationRequest({
      email: "juzgamiento@example.com",
      role: "judge",
    });

    await expect(
      requireAdminPanelReader(auditorRequest),
    ).resolves.toMatchObject({
      role: "auditor",
    });
    await expect(requireJudgePanelUser(judgeRequest)).resolves.toMatchObject({
      role: "judge",
    });

    await expectThrownResponse(requireJudgePanelUser(auditorRequest), 403);
    await expectThrownResponse(requireAdminPanelReader(judgeRequest), 403);
  });
});

// The shared signed-in request, plus the academy row an academy user needs to
// get past registration (`withAcademy: false` leaves it pending).
async function createSignedInNavigationRequest(
  input: Parameters<typeof createSignedInRequest>[0] & {
    withAcademy?: boolean;
  },
) {
  const signedIn = await createSignedInRequest(input);

  if (input.role === "academy" && input.withAcademy !== false) {
    await db.insert(academies).values({
      id: `academy_${signedIn.userId}`,
      userId: signedIn.userId,
      name: "Academia de Prueba",
      contactName: "Contacto",
      phone: "11 1234-5678",
    });
  }

  return signedIn;
}

async function createCredentialUser(input: {
  email: string;
  role: UserRole;
  internalUsername?: string;
}) {
  const signUpResult = await createAccessUser({
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

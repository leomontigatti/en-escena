import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, session, user } from "@/db/schema";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { auth } from "@/lib/auth/auth.server";
import {
  requireAcademyUser,
  requireAdminUser,
  requireInternalUser,
  requireSignedInUser,
} from "@/lib/auth/internal-access.server";
import type { InternalUserRole } from "@/lib/auth/internal-user-roles";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("internal access authorization", () => {
  test("redirects missing sessions to login with a safe destination", async () => {
    const response = await expectThrownResponse(
      requireSignedInUser(
        new Request("http://localhost/portal/coreografias?estado=pendiente"),
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/ingresar?redirectTo=%2Fportal%2Fcoreografias%3Festado%3Dpendiente&motivo=continuar",
    );
  });

  test("uses the expired-session notice when a stale session cookie is present", async () => {
    const response = await expectThrownResponse(
      requireSignedInUser(
        new Request("http://localhost/administracion", {
          headers: {
            cookie: "sb-access-token=sesion-invalida",
          },
        }),
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/ingresar?redirectTo=%2Fadministracion&motivo=expirada",
    );
  });

  test("redirects private actions to login with the action path as destination", async () => {
    const response = await expectThrownResponse(
      requireSignedInUser(
        new Request("http://localhost/administracion/usuarios/nuevo", {
          method: "POST",
          body: new URLSearchParams({ name: "Nuevo Usuario" }),
        }),
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/ingresar?redirectTo=%2Fadministracion%2Fusuarios%2Fnuevo&motivo=continuar",
    );
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

  test("redirects internal users with mandatory password change away from private routes", async () => {
    const { request } = await createSignedInRequest({
      email: "obligatorio@example.com",
      role: "admin",
      requiresPasswordChange: true,
    });

    const response = await expectThrownResponse(requireSignedInUser(request));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/cambiar-contrasena");
  });

  test("blocks suspended users from private routes and revokes their sessions", async () => {
    const { request, userId } = await createSignedInRequest({
      email: "suspendido.privado@example.com",
      role: "admin",
    });

    await db.update(user).set({ suspended: true }).where(eq(user.id, userId));

    const response = await expectThrownResponse(requireSignedInUser(request));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/ingresar?redirectTo=%2Fprotected&motivo=expirada",
    );
    await expect(
      db.query.session.findMany({
        where: eq(session.userId, userId),
      }),
    ).resolves.toEqual([]);
  });

  test("blocks sessions invalidated after administrative revocation", async () => {
    const { request, userId } = await createSignedInRequest({
      email: "revocado.privado@example.com",
      role: "admin",
    });

    await db
      .update(user)
      .set({
        sessionInvalidBefore: new Date(Date.now() + 60_000),
      })
      .where(eq(user.id, userId));

    const response = await expectThrownResponse(requireSignedInUser(request));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/ingresar?redirectTo=%2Fprotected&motivo=expirada",
    );
    await expect(
      db.query.session.findMany({
        where: eq(session.userId, userId),
      }),
    ).resolves.toEqual([]);
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
      requiresPasswordChange: input.requiresPasswordChange,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  return {
    request: new Request("http://localhost/protected", {
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
    userId: signUpResult.response.user.id,
  };
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

async function expectThrownResponse(resultPromise: Promise<unknown>) {
  try {
    await resultPromise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    return error as Response;
  }

  throw new Error("Expected a response to be thrown.");
}

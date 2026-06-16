import { and, eq } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  account,
  academies,
  administrativeAuditEntries,
  session,
  user,
} from "@/db/schema";
import { auth } from "@/lib/auth/auth.server";
import {
  loader as listLoader,
  AdministracionUsuariosRouteView,
} from "@/routes/administracion.usuarios";
import {
  action as detailAction,
  AdministracionUsuarioDetalleRouteView,
  loader as detailLoader,
} from "@/routes/administracion.usuarios_.$userId";
import { action as signInAction } from "@/routes/ingresar";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion/usuarios/:userId route", () => {
  test("suspends and reactivates an internal user, revokes sessions, and records status audits", async () => {
    const targetUser = await createSignedInRequest({
      email: "usuario.suspendible@example.com",
      role: "judge",
      requiresPasswordChange: false,
      requestUrl: "http://localhost/juzgamiento",
      userName: "Julia Suspendible",
      internalUsername: "julia.suspendible",
    });
    const adminUser = await createSignedInRequest({
      email: "admin.suspende@example.com",
      role: "admin",
      requiresPasswordChange: false,
      requestUrl: `http://localhost/administracion/usuarios/${targetUser.userId}`,
      userName: "Ada Suspende",
      internalUsername: "ada.suspende",
    });
    const adminRequest = adminUser.request;

    const initialDetailMarkup = renderDetailRoute(
      await detailLoader(detailRouteArgs(adminRequest, targetUser.userId)),
      targetUser.userId,
    );

    expect(initialDetailMarkup).toContain("Suspender Usuario");
    expect(initialDetailMarkup).not.toContain("Reactivar Usuario");
    await expect(
      db.query.user.findFirst({
        columns: { suspended: true },
        where: eq(user.id, targetUser.userId),
      }),
    ).resolves.toMatchObject({ suspended: false });
    await expect(
      db.select().from(session).where(eq(session.userId, targetUser.userId)),
    ).resolves.toHaveLength(1);

    const suspendResponse = await expectThrownResponse(
      detailAction(
        detailActionArgs(
          createPostRequest(
            adminRequest.url,
            adminRequest.headers.get("cookie") ?? "",
            { intent: "suspend-user" },
          ),
          targetUser.userId,
        ),
      ),
      302,
    );

    expect(suspendResponse.headers.get("location")).toBe(
      `/administracion/usuarios/${targetUser.userId}?notificacion=usuario-interno-suspendido`,
    );
    await expect(
      db.query.user.findFirst({
        columns: { suspended: true },
        where: eq(user.id, targetUser.userId),
      }),
    ).resolves.toMatchObject({ suspended: true });
    await expect(
      db.select().from(session).where(eq(session.userId, targetUser.userId)),
    ).resolves.toEqual([]);

    const suspendedDetail = await detailLoader(
      detailRouteArgs(
        new Request(
          `http://localhost${suspendResponse.headers.get("location")!}`,
          {
            headers: {
              cookie: adminRequest.headers.get("cookie") ?? "",
            },
          },
        ),
        targetUser.userId,
      ),
    );
    expect(suspendedDetail.user.state).toBe("suspended");
    const suspendedDetailMarkup = renderDetailRoute(
      suspendedDetail,
      targetUser.userId,
    );
    expect(suspendedDetailMarkup).not.toContain(
      "Guardamos el estado del Usuario interno.",
    );
    expect(suspendedDetailMarkup).toContain("Reactivar Usuario");
    expect(suspendedDetailMarkup).not.toContain("Suspender Usuario");

    const reactivateResponse = await expectThrownResponse(
      detailAction(
        detailActionArgs(
          createPostRequest(
            adminRequest.url,
            adminRequest.headers.get("cookie") ?? "",
            { intent: "reactivate-user" },
          ),
          targetUser.userId,
        ),
      ),
      302,
    );

    expect(reactivateResponse.headers.get("location")).toBe(
      `/administracion/usuarios/${targetUser.userId}?notificacion=usuario-interno-reactivado`,
    );
    await expect(
      db.query.user.findFirst({
        columns: { suspended: true },
        where: eq(user.id, targetUser.userId),
      }),
    ).resolves.toMatchObject({ suspended: false });
    await expect(
      db
        .select()
        .from(administrativeAuditEntries)
        .where(eq(administrativeAuditEntries.entityId, targetUser.userId))
        .orderBy(administrativeAuditEntries.createdAt),
    ).resolves.toEqual([
      expect.objectContaining({
        action: "archive",
        beforeValues: expect.objectContaining({ suspended: false }),
        afterValues: expect.objectContaining({ suspended: true }),
      }),
      expect.objectContaining({
        action: "reactivate",
        beforeValues: expect.objectContaining({ suspended: true }),
        afterValues: expect.objectContaining({ suspended: false }),
      }),
    ]);
  });

  test("prevents admins from suspending their own user", async () => {
    const selfAdmin = await createSignedInRequest({
      email: "admin.self.suspension@example.com",
      role: "admin",
      requiresPasswordChange: false,
      requestUrl: "http://localhost/administracion/usuarios/self-admin",
      userName: "Admin Self Suspension",
      internalUsername: "admin.self.suspension",
    });

    const selfSuspendResult = await detailAction(
      detailActionArgs(
        createPostRequest(
          `http://localhost/administracion/usuarios/${selfAdmin.userId}`,
          selfAdmin.request.headers.get("cookie") ?? "",
          { intent: "suspend-user" },
        ),
        selfAdmin.userId,
      ),
    );

    expect(selfSuspendResult).toMatchObject({
      status: "error",
      message: "No podés suspender tu propio Usuario.",
    });
  });

  test("updates an internal user, revokes sessions on permission change, and persists sanitized audit data", async () => {
    const targetUser = await createSignedInRequest({
      email: "usuario.interno.original@example.com",
      role: "judge",
      requiresPasswordChange: false,
      requestUrl: "http://localhost/juzgamiento",
      userName: "Julia Original",
      internalUsername: "julia.original",
    });
    const { request: adminRequest } = await createSignedInRequest({
      email: "admin.editor@example.com",
      role: "admin",
      requiresPasswordChange: false,
      requestUrl: `http://localhost/administracion/usuarios/${targetUser.userId}?modo=editar`,
      userName: "Ada Editora",
      internalUsername: "ada.editora",
    });

    await expect(
      db.select().from(session).where(eq(session.userId, targetUser.userId)),
    ).resolves.toHaveLength(1);

    const response = await expectThrownResponse(
      detailAction(
        detailActionArgs(
          createPostRequest(
            adminRequest.url,
            adminRequest.headers.get("cookie") ?? "",
            {
              name: "  Julia Actualizada  ",
              email: " Julia.Actualizada@Example.COM ",
              role: "auditor",
            },
          ),
          targetUser.userId,
        ),
      ),
      302,
    );

    expect(response.headers.get("location")).toBe(
      `/administracion/usuarios/${targetUser.userId}?notificacion=usuario-interno-actualizado`,
    );
    await expect(
      db.query.user.findFirst({
        where: eq(user.id, targetUser.userId),
      }),
    ).resolves.toMatchObject({
      name: "Julia Actualizada",
      email: "julia.actualizada@example.com",
      internalUsername: "julia.original",
      role: "auditor",
    });
    await expect(
      db.select().from(session).where(eq(session.userId, targetUser.userId)),
    ).resolves.toEqual([]);
    await expect(
      db
        .select()
        .from(administrativeAuditEntries)
        .where(eq(administrativeAuditEntries.entityId, targetUser.userId)),
    ).resolves.toEqual([
      expect.objectContaining({
        entityType: "user",
        entityId: targetUser.userId,
        action: "update",
        reason: null,
        beforeValues: {
          email: "usuario.interno.original@example.com",
          internalUsername: "julia.original",
          name: "Julia Original",
          requiresPasswordChange: false,
          role: "judge",
          suspended: false,
        },
        afterValues: {
          email: "julia.actualizada@example.com",
          internalUsername: "julia.original",
          name: "Julia Actualizada",
          requiresPasswordChange: false,
          role: "auditor",
          suspended: false,
        },
      }),
    ]);
  });

  test("resets an internal user password with mandatory change, revokes sessions, and keeps audit payloads sanitized", async () => {
    const targetUser = await createSignedInRequest({
      email: "usuario.restablecer@example.com",
      role: "judge",
      requiresPasswordChange: false,
      requestUrl: "http://localhost/juzgamiento",
      userName: "Julia Restablecida",
      internalUsername: "julia.restablecida",
      password: "password-anterior",
    });
    const { request: adminRequest } = await createSignedInRequest({
      email: "admin.restablece@example.com",
      role: "admin",
      requiresPasswordChange: false,
      requestUrl: `http://localhost/administracion/usuarios/${targetUser.userId}`,
      userName: "Ada Restablece",
      internalUsername: "ada.restablece",
    });

    await expect(
      db.select().from(session).where(eq(session.userId, targetUser.userId)),
    ).resolves.toHaveLength(1);

    const previousCredentialPassword = await findCredentialPassword(
      targetUser.userId,
    );

    const response = await expectThrownResponse(
      detailAction(
        detailActionArgs(
          createPostRequest(
            adminRequest.url,
            adminRequest.headers.get("cookie") ?? "",
            {
              intent: "reset-password",
              temporaryPassword: "temporal-nueva",
            },
          ),
          targetUser.userId,
        ),
      ),
      302,
    );

    expect(response.headers.get("location")).toBe(
      `/administracion/usuarios/${targetUser.userId}?notificacion=usuario-interno-restablecido`,
    );
    await expect(
      db.query.user.findFirst({
        columns: { requiresPasswordChange: true },
        where: eq(user.id, targetUser.userId),
      }),
    ).resolves.toMatchObject({ requiresPasswordChange: true });
    await expect(
      db.select().from(session).where(eq(session.userId, targetUser.userId)),
    ).resolves.toEqual([]);

    const nextCredentialPassword = await findCredentialPassword(
      targetUser.userId,
    );

    expect(nextCredentialPassword).toBeTruthy();
    expect(nextCredentialPassword).not.toBe(previousCredentialPassword);
    expect(nextCredentialPassword).not.toBe("temporal-nueva");
    expect(
      await verifyPassword({
        hash: nextCredentialPassword ?? "",
        password: "temporal-nueva",
      }),
    ).toBe(true);

    await expect(
      db
        .select()
        .from(administrativeAuditEntries)
        .where(eq(administrativeAuditEntries.entityId, targetUser.userId))
        .orderBy(administrativeAuditEntries.createdAt),
    ).resolves.toEqual([
      expect.objectContaining({
        action: "reset-password",
        beforeValues: {
          email: "usuario.restablecer@example.com",
          internalUsername: "julia.restablecida",
          name: "Julia Restablecida",
          requiresPasswordChange: false,
          role: "judge",
          suspended: false,
        },
        afterValues: {
          email: "usuario.restablecer@example.com",
          internalUsername: "julia.restablecida",
          name: "Julia Restablecida",
          requiresPasswordChange: true,
          role: "judge",
          suspended: false,
        },
      }),
    ]);

    const savedAuditEntry = await db.query.administrativeAuditEntries.findFirst(
      {
        where: eq(administrativeAuditEntries.entityId, targetUser.userId),
      },
    );
    expect(JSON.stringify(savedAuditEntry)).not.toContain("temporal-nueva");
    expect(JSON.stringify(savedAuditEntry)).not.toContain(
      nextCredentialPassword ?? "",
    );

    const loginResponse = await expectThrownResponse(
      submitSignInAction("julia.restablecida", "temporal-nueva"),
      302,
    );
    expect(loginResponse.headers.get("location")).toBe("/cambiar-contrasena");
  });

  test("blocks non-admin mutations and prevents self-demotion of the only admin", async () => {
    const targetUser = await createSignedInRequest({
      email: "usuario.bloqueado@example.com",
      role: "judge",
      requiresPasswordChange: false,
      requestUrl: "http://localhost/juzgamiento",
      userName: "Julia Bloqueada",
      internalUsername: "julia.bloqueada",
    });

    const blockedUsers: Array<{
      role: "academy" | "auditor" | "judge";
      userId: string;
      request: Request;
    }> = [];

    for (const role of ["auditor", "judge", "academy"] as const) {
      const blockedUser = await createSignedInRequest({
        email: `${role}.sin-permiso@example.com`,
        role,
        requiresPasswordChange: false,
        requestUrl: `http://localhost/administracion/usuarios/${targetUser.userId}?modo=editar`,
        userName: `${role} sin permiso`,
        internalUsername:
          role === "academy" ? undefined : `${role}.sin.permiso`,
      });
      blockedUsers.push({ role, ...blockedUser });

      await expectThrownResponse(
        detailAction(
          detailActionArgs(
            createPostRequest(
              blockedUser.request.url,
              blockedUser.request.headers.get("cookie") ?? "",
              {
                name: "No autorizado",
                email: "",
                role: "auditor",
              },
            ),
            targetUser.userId,
          ),
        ),
        403,
      );
    }

    const selfAdmin = await createSignedInRequest({
      email: "admin.self@example.com",
      role: "admin",
      requiresPasswordChange: false,
      requestUrl:
        "http://localhost/administracion/usuarios/self-admin?modo=editar",
      userName: "Admin Self",
      internalUsername: "admin.self",
    });

    for (const blockedUser of blockedUsers) {
      await db
        .update(user)
        .set({ role: blockedUser.role === "academy" ? "academy" : "judge" })
        .where(eq(user.id, blockedUser.userId));
    }
    const selfResult = await detailAction(
      detailActionArgs(
        createPostRequest(
          `http://localhost/administracion/usuarios/${selfAdmin.userId}?modo=editar`,
          selfAdmin.request.headers.get("cookie") ?? "",
          {
            name: "Admin Self",
            email: "",
            role: "auditor",
          },
        ),
        selfAdmin.userId,
      ),
    );

    expect(selfResult).toMatchObject({
      status: "error",
      message: "No podés cambiar tu propio permiso de Administrador.",
    });
    await expect(
      db.query.user.findFirst({
        columns: { role: true },
        where: eq(user.id, selfAdmin.userId),
      }),
    ).resolves.toMatchObject({ role: "admin" });
  });

  test("allows admin and auditor access, blocks academy and judge users, and renders readonly internal and academy detail views", async () => {
    const internalUser = await createSignedInRequest({
      email: "admin.detalle.usuario@example.com",
      role: "admin",
      requiresPasswordChange: true,
      requestUrl: "http://localhost/administracion/usuarios",
      userName: "Ada Admin",
      internalUsername: "ada.admin",
    });
    const academyUser = await createAcademyUser({
      email: "academia.detalle.usuario@example.com",
      academyName: "Academia Norte",
      contactName: "Nora Norte",
    });

    const { request: adminRequest } = await createSignedInRequest({
      email: "admin.viewer@example.com",
      role: "admin",
      requiresPasswordChange: false,
      requestUrl: `http://localhost/administracion/usuarios/${internalUser.userId}`,
      userName: "Admin Viewer",
      internalUsername: "admin.viewer",
    });
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor.viewer@example.com",
      role: "auditor",
      requiresPasswordChange: false,
      requestUrl: `http://localhost/administracion/usuarios/${internalUser.userId}`,
      userName: "Ariel Auditor",
      internalUsername: "ariel.auditor",
    });
    const academyViewer = await createAcademyUser({
      email: "academy.viewer@example.com",
      academyName: "Academia Visora",
      contactName: "Amalia Visora",
    });
    const { request: judgeRequest } = await createSignedInRequest({
      email: "judge.viewer@example.com",
      role: "judge",
      requiresPasswordChange: false,
      requestUrl: `http://localhost/administracion/usuarios/${internalUser.userId}`,
      userName: "Julia Juez",
      internalUsername: "julia.juez",
    });

    const listData = await listLoader(
      listRouteArgs(
        new Request("http://localhost/administracion/usuarios", {
          headers: {
            cookie: adminRequest.headers.get("cookie") ?? "",
          },
        }),
      ),
    );
    const listMarkup = renderListRoute(listData);
    const internalDetailData = await detailLoader(
      detailRouteArgs(adminRequest, internalUser.userId),
    );

    expect(listMarkup).toContain(
      `/administracion/usuarios/${internalUser.userId}`,
    );
    expect(listMarkup).toContain(
      `/administracion/usuarios/${academyUser.userId}`,
    );

    expect(internalDetailData).toMatchObject({
      user: {
        id: internalUser.userId,
        userType: "internal",
      },
    });
    await expect(
      detailLoader(detailRouteArgs(auditorRequest, internalUser.userId)),
    ).resolves.toMatchObject({
      user: {
        id: internalUser.userId,
        userType: "internal",
      },
    });
    await expectThrownResponse(
      detailLoader(detailRouteArgs(academyViewer.request, internalUser.userId)),
      403,
    );
    await expectThrownResponse(
      detailLoader(detailRouteArgs(judgeRequest, internalUser.userId)),
      403,
    );

    const internalMarkup = renderDetailRoute(
      internalDetailData,
      internalUser.userId,
    );
    const auditorInternalMarkup = renderDetailRoute(
      await detailLoader(detailRouteArgs(auditorRequest, internalUser.userId)),
      internalUser.userId,
    );

    expect(internalMarkup).toContain("Ada Admin");
    expect(internalMarkup).toContain("ada.admin");
    expect(internalMarkup).toContain("admin.detalle.usuario@example.com");
    expect(internalMarkup).toContain("Permiso principal");
    expect(internalMarkup).toContain("Administrador");
    expect(internalMarkup).toContain("Estado");
    expect(internalMarkup).toContain("Cambio obligatorio");
    expect(internalMarkup).toContain("Editar datos");
    expect(internalMarkup).toContain("Restablecer contraseña");
    expect(internalMarkup).toContain("Suspender Usuario");
    expect(auditorInternalMarkup).not.toContain("Editar datos");
    expect(auditorInternalMarkup).not.toContain("Restablecer contraseña");
    expect(auditorInternalMarkup).not.toContain("Suspender Usuario");
    expect(auditorInternalMarkup).not.toContain("Guardar cambios");

    const academyDetailRequest = new Request(
      `http://localhost/administracion/usuarios/${academyUser.userId}`,
      {
        headers: {
          cookie: auditorRequest.headers.get("cookie") ?? "",
        },
      },
    );
    const academyMarkup = renderDetailRoute(
      await detailLoader(
        detailRouteArgs(academyDetailRequest, academyUser.userId),
      ),
      academyUser.userId,
    );

    expect(academyMarkup).toContain("Nora Norte");
    expect(academyMarkup).toContain("academia.detalle.usuario@example.com");
    expect(academyMarkup).toContain("Usuario de academia");
    expect(academyMarkup).toContain("Academia");
    expect(academyMarkup).toContain(
      `/administracion/academias/${academyUser.academy.id}`,
    );
    expect(academyMarkup).not.toContain("Permiso principal");
    expect(academyMarkup).not.toContain("Suspender Usuario");
    expect(academyMarkup).not.toContain("Restablecer contraseña");
    expect(academyMarkup).not.toContain("Cambiar contraseña");
    expect(listData).not.toHaveProperty("email");
    expect(listData).not.toHaveProperty("eventOptions");
    expect(listData).not.toHaveProperty("selectedEventId");
    expect(internalDetailData).not.toHaveProperty("email");
    expect(internalDetailData).not.toHaveProperty("eventOptions");
    expect(internalDetailData).not.toHaveProperty("selectedEventId");
  });
});

function renderListRoute(
  loaderData: Partial<
    Parameters<typeof AdministracionUsuariosRouteView>[0]["loaderData"]
  >,
) {
  const RoutesStub = createRoutesStub([
    {
      path: "/administracion/usuarios",
      Component: AdministracionUsuariosRouteView,
    },
  ]);

  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: ["/administracion/usuarios"],
      hydrationData: {
        loaderData: {
          "0": {
            canManage: true,
            filters: {
              query: "",
              role: "all",
              state: "all",
              type: "all",
            },
            users: [],
            ...loaderData,
          },
        },
      },
    }),
  );
}

function renderDetailRoute(
  loaderData: Partial<
    Parameters<typeof AdministracionUsuarioDetalleRouteView>[0]["loaderData"]
  >,
  userId: string,
) {
  const RoutesStub = createRoutesStub([
    {
      path: "/administracion/usuarios/:userId",
      Component: AdministracionUsuarioDetalleRouteView,
    },
  ]);

  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: [`/administracion/usuarios/${userId}`],
      hydrationData: {
        loaderData: {
          "0": {
            canManage: false,
            backToList: "/administracion/usuarios",
            user: {
              id: userId,
              academyId: null,
              academyName: null,
              email: "user@example.com",
              identifier: "user@example.com",
              mainRole: "academy",
              name: "Usuario",
              state: "active",
              userType: "academy",
            },
            ...loaderData,
          },
        },
      },
    }),
  );
}

async function createSignedInRequest(input: {
  email: string;
  role: "academy" | "admin" | "auditor" | "judge";
  requiresPasswordChange?: boolean;
  requestUrl: string;
  userName: string;
  internalUsername?: string;
  password?: string;
}) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: input.email,
      name: input.userName,
      password: input.password ?? "password-segura",
    },
    returnHeaders: true,
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: input.role,
      internalUsername: input.internalUsername ?? null,
      requiresPasswordChange: input.requiresPasswordChange ?? false,
      name: input.userName,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  return {
    userId: signUpResult.response.user.id,
    request: new Request(input.requestUrl, {
      headers: {
        cookie: createRequestCookie(signUpResult.headers),
      },
    }),
  };
}

async function createAcademyUser(input: {
  academyName: string;
  contactName: string;
  email: string;
}) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: input.email,
      name: input.contactName,
      password: "password-segura",
    },
    returnHeaders: true,
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: "academy",
      name: input.contactName,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  const [academy] = await db
    .insert(academies)
    .values({
      userId: signUpResult.response.user.id,
      name: input.academyName,
      contactName: input.contactName,
      phone: "1111-1111",
    })
    .returning();

  if (!academy) {
    throw new Error("Expected academy to be created.");
  }

  return {
    academy,
    request: new Request("http://localhost/portal", {
      headers: {
        cookie: createRequestCookie(signUpResult.headers),
      },
    }),
    userId: signUpResult.response.user.id,
  };
}

function listRouteArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/usuarios",
  };
}

function detailRouteArgs(request: Request, userId: string) {
  return {
    request,
    params: { userId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/usuarios/:userId",
  };
}

function detailActionArgs(request: Request, userId: string) {
  return {
    request,
    params: { userId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/usuarios/:userId",
  };
}

function createPostRequest(
  requestUrl: string,
  cookie: string,
  values: Record<string, string>,
) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return new Request(requestUrl, {
    method: "POST",
    body: formData,
    headers: { cookie },
  });
}

function submitSignInAction(identifier: string, password: string) {
  const formData = new FormData();
  formData.set("identifier", identifier);
  formData.set("password", password);

  return signInAction({
    url: new URL("http://localhost/ingresar"),
    pattern: "/ingresar",
    request: new Request("http://localhost/ingresar", {
      method: "POST",
      body: formData,
    }),
    params: {},
    context: {},
  });
}

async function findCredentialPassword(userId: string) {
  const credentialAccount = await db.query.account.findFirst({
    columns: { password: true },
    where: and(
      eq(account.userId, userId),
      eq(account.providerId, "credential"),
    ),
  });

  return credentialAccount?.password ?? null;
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

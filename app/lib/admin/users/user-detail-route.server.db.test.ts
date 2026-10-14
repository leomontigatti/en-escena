import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub, RouterContextProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createAcademyUser } from "@/lib/test-support/academies";
import { accessSession, user } from "@/db/schema";
import { expectThrownResponse } from "@/lib/test-support/http";
import {
  loader as listLoader,
  InternalUsersListRouteView,
} from "@/routes/administracion.usuarios";
import {
  action as detailAction,
  InternalUserDetailRouteView,
  loader as detailLoader,
} from "@/routes/administracion.usuarios_.$userId";
import { action as signInAction } from "@/routes/ingresar";

import { createPostRequest, routeArgs } from "@/lib/admin/test-support/route";
import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("`/administracion/usuarios/:userId` route", () => {
  test("suspends and reactivates an internal user and revokes sessions", async () => {
    const targetUser = await createSignedInRequest({
      email: "usuario.suspendible@example.com",
      role: "judge",
      requestUrl: "http://localhost/juzgamiento",
      name: "Julia Suspendible",
      internalUsername: "julia.suspendible",
    });
    const adminUser = await createSignedInRequest({
      email: "admin.suspende@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/usuarios/${targetUser.userId}`,
      name: "Ada Suspende",
      internalUsername: "ada.suspende",
    });
    const adminRequest = adminUser.request;

    const initialDetailMarkup = renderDetailRoute(
      await detailLoader(detailRouteArgs(adminRequest, targetUser.userId)),
      targetUser.userId,
    );

    expect(initialDetailMarkup).toContain("Acciones");
    expect(initialDetailMarkup).not.toContain("Reactivar usuario");
    await expect(
      db.query.user.findFirst({
        columns: { suspended: true },
        where: eq(user.id, targetUser.userId),
      }),
    ).resolves.toMatchObject({ suspended: false });
    await expect(
      db
        .select()
        .from(accessSession)
        .where(eq(accessSession.userId, targetUser.userId)),
    ).resolves.toHaveLength(1);

    const suspendResult = await detailAction(
      detailRouteArgs(
        createPostRequest(
          adminRequest.url,
          adminRequest.headers.get("cookie") ?? "",
          { intent: "suspend-user" },
        ),
        targetUser.userId,
      ),
    );

    expect(suspendResult).toEqual({
      status: "success",
      message: "Usuario suspendido.",
    });
    await expect(
      db.query.user.findFirst({
        columns: { suspended: true },
        where: eq(user.id, targetUser.userId),
      }),
    ).resolves.toMatchObject({ suspended: true });
    await expect(
      db
        .select()
        .from(accessSession)
        .where(eq(accessSession.userId, targetUser.userId)),
    ).resolves.toEqual([]);

    const suspendedDetail = await detailLoader(
      detailRouteArgs(
        new Request(
          `http://localhost/administracion/usuarios/${targetUser.userId}`,
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
    expect(suspendedDetailMarkup).toContain("Acciones");
    expect(suspendedDetailMarkup).not.toContain("Suspender usuario");

    const reactivateResult = await detailAction(
      detailRouteArgs(
        createPostRequest(
          adminRequest.url,
          adminRequest.headers.get("cookie") ?? "",
          { intent: "reactivate-user" },
        ),
        targetUser.userId,
      ),
    );

    expect(reactivateResult).toEqual({
      status: "success",
      message: "Usuario reactivado.",
    });
    await expect(
      db.query.user.findFirst({
        columns: { suspended: true },
        where: eq(user.id, targetUser.userId),
      }),
    ).resolves.toMatchObject({ suspended: false });
  });

  test("prevents admins from suspending their own user", async () => {
    const selfAdmin = await createSignedInRequest({
      email: "admin.self.suspension@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios/self-admin",
      name: "Admin Self Suspension",
      internalUsername: "admin.self.suspension",
    });

    const selfSuspendResult = await detailAction(
      detailRouteArgs(
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

  test("updates an internal user and revokes sessions on permission change", async () => {
    const targetUser = await createSignedInRequest({
      email: "usuario.interno.original@example.com",
      role: "judge",
      requestUrl: "http://localhost/juzgamiento",
      name: "Julia Original",
      internalUsername: "julia.original",
    });
    const { request: adminRequest } = await createSignedInRequest({
      email: "admin.editor@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/usuarios/${targetUser.userId}`,
      name: "Ada Editora",
      internalUsername: "ada.editora",
    });

    await expect(
      db
        .select()
        .from(accessSession)
        .where(eq(accessSession.userId, targetUser.userId)),
    ).resolves.toHaveLength(1);

    const updateResult = await detailAction(
      detailRouteArgs(
        createPostRequest(
          adminRequest.url,
          adminRequest.headers.get("cookie") ?? "",
          {
            name: "  Julia Actualizada  ",
            role: "auditor",
          },
        ),
        targetUser.userId,
      ),
    );

    expect(updateResult).toEqual({
      status: "success",
      message: "Usuario interno actualizado.",
    });
    await expect(
      db.query.user.findFirst({
        where: eq(user.id, targetUser.userId),
      }),
    ).resolves.toMatchObject({
      name: "Julia Actualizada",
      email: "usuario.interno.original@example.com",
      internalUsername: "julia.original",
      role: "auditor",
    });
    await expect(
      db
        .select()
        .from(accessSession)
        .where(eq(accessSession.userId, targetUser.userId)),
    ).resolves.toEqual([]);
  });

  test("resets an internal user password, revokes sessions and lets the user in with the new one", async () => {
    const targetUser = await createSignedInRequest({
      email: "usuario.restablecer@example.com",
      role: "judge",
      requestUrl: "http://localhost/juzgamiento",
      name: "Julia Restablecida",
      internalUsername: "julia.restablecida",
      password: "password-anterior",
    });
    const { request: adminRequest } = await createSignedInRequest({
      email: "admin.restablece@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/usuarios/${targetUser.userId}`,
      name: "Ada Restablece",
      internalUsername: "ada.restablece",
    });

    await expect(
      db
        .select()
        .from(accessSession)
        .where(eq(accessSession.userId, targetUser.userId)),
    ).resolves.toHaveLength(1);

    const resetResult = await detailAction(
      detailRouteArgs(
        createPostRequest(
          adminRequest.url,
          adminRequest.headers.get("cookie") ?? "",
          {
            intent: "reset-password",
            password: "clave-nueva",
          },
        ),
        targetUser.userId,
      ),
    );

    expect(resetResult).toEqual({
      status: "success",
      message: "Contraseña restablecida.",
    });
    await expect(
      db
        .select()
        .from(accessSession)
        .where(eq(accessSession.userId, targetUser.userId)),
    ).resolves.toEqual([]);

    const loginResponse = await expectThrownResponse(
      submitSignInAction("julia.restablecida", "clave-nueva"),
      302,
    );
    expect(loginResponse.headers.get("location")).toBe("/juzgamiento");

    const oldPasswordResponse = await signInAction({
      url: new URL("http://localhost/ingresar"),
      pattern: "/ingresar",
      request: new Request("http://localhost/ingresar", {
        method: "POST",
        body: new URLSearchParams({
          identifier: "julia.restablecida",
          password: "password-anterior",
        }),
      }),
      params: {},
      context: new RouterContextProvider(),
    });

    expect(oldPasswordResponse).toMatchObject({
      status: "error",
      message: "No pudimos ingresar con esos datos.",
    });
  });

  test("blocks non-admin mutations and refuses a crafted role change on an administrator", async () => {
    const targetUser = await createSignedInRequest({
      email: "usuario.bloqueado@example.com",
      role: "judge",
      requestUrl: "http://localhost/juzgamiento",
      name: "Julia Bloqueada",
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
        requestUrl: `http://localhost/administracion/usuarios/${targetUser.userId}`,
        name: `${role} sin permiso`,
        internalUsername:
          role === "academy" ? undefined : `${role}.sin.permiso`,
      });
      blockedUsers.push({ role, ...blockedUser });

      await expectThrownResponse(
        detailAction(
          detailRouteArgs(
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
      requestUrl: "http://localhost/administracion/usuarios/self-admin",
      name: "Admin Self",
      internalUsername: "admin.self",
    });

    for (const blockedUser of blockedUsers) {
      await db
        .update(user)
        .set({ role: blockedUser.role === "academy" ? "academy" : "judge" })
        .where(eq(user.id, blockedUser.userId));
    }
    const selfResult = await detailAction(
      detailRouteArgs(
        createPostRequest(
          `http://localhost/administracion/usuarios/${selfAdmin.userId}`,
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
      message: "No se puede cambiar el permiso de un Administrador.",
    });
    await expect(
      db.query.user.findFirst({
        columns: { role: true },
        where: eq(user.id, selfAdmin.userId),
      }),
    ).resolves.toMatchObject({ role: "admin" });

    const otherAdmin = await createSignedInRequest({
      email: "admin.otro@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios",
      name: "Admin Otro",
      internalUsername: "admin.otro",
    });
    const craftedResult = await detailAction(
      detailRouteArgs(
        createPostRequest(
          `http://localhost/administracion/usuarios/${otherAdmin.userId}`,
          selfAdmin.request.headers.get("cookie") ?? "",
          {
            name: "Admin Otro",
            email: "",
            role: "judge",
          },
        ),
        otherAdmin.userId,
      ),
    );

    expect(craftedResult).toMatchObject({
      status: "error",
      message: "No se puede cambiar el permiso de un Administrador.",
    });
    await expect(
      db.query.user.findFirst({
        columns: { role: true },
        where: eq(user.id, otherAdmin.userId),
      }),
    ).resolves.toMatchObject({ role: "admin" });
  });

  // The auditor is refused: users are not reviewed for them yet (PRD #1448).
  test("allows admin access, blocks auditor, academy and judge users, and renders the internal and academy detail views", async () => {
    const internalUser = await createSignedInRequest({
      email: "admin.detalle.usuario@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios",
      name: "Ada Admin",
      internalUsername: "ada.admin",
    });
    const academyUser = await createAcademyUser({
      email: "academia.detalle.usuario@example.com",
      academyName: "Academia Norte",
      contactName: "Nora Norte",
      name: "Nora Norte",
    });

    const { request: adminRequest } = await createSignedInRequest({
      email: "admin.viewer@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/usuarios/${internalUser.userId}`,
      name: "Admin Viewer",
      internalUsername: "admin.viewer",
    });
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor.viewer@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/usuarios/${internalUser.userId}`,
      name: "Ariel Auditor",
      internalUsername: "ariel.auditor",
    });
    const academyViewer = await createAcademyUser({
      email: "academy.viewer@example.com",
      academyName: "Academia Visora",
      contactName: "Amalia Visora",
      name: "Amalia Visora",
    });
    const { request: judgeRequest } = await createSignedInRequest({
      email: "judge.viewer@example.com",
      role: "judge",
      requestUrl: `http://localhost/administracion/usuarios/${internalUser.userId}`,
      name: "Julia Juez",
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
    await expectThrownResponse(
      detailLoader(detailRouteArgs(auditorRequest, internalUser.userId)),
      403,
    );
    await expectThrownResponse(
      detailLoader(
        detailRouteArgs(
          new Request("http://localhost/portal", {
            headers: { cookie: academyViewer.cookie },
          }),
          internalUser.userId,
        ),
      ),
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

    expect(internalMarkup).toMatch(/<h2[^>]*>Ada Admin<\/h2>/);
    expect(internalMarkup).toContain("Ada Admin");
    expect(internalMarkup).toContain("ada.admin");
    expect(internalMarkup).not.toContain("admin.detalle.usuario@example.com");
    expect(internalMarkup).not.toContain("Correo");
    expect(internalMarkup).toContain("Permiso principal");
    expect(internalDetailData.user.mainRole).toBe("admin");
    expect(internalMarkup).toContain(
      "Actualizá los datos del usuario interno y sus permisos.",
    );
    expect(internalMarkup).toContain("Guardar");
    expect(internalMarkup).toContain("lucide-lock");
    expect(internalMarkup).not.toContain("Detalle del Usuario");
    expect(internalMarkup).not.toContain("Volver a Usuarios");
    expect(internalMarkup).not.toContain("Editar datos");
    expect(internalMarkup).toContain("Acciones");
    expect(internalMarkup).not.toContain("Restablecer contraseña");
    expect(internalMarkup).not.toContain("Suspender usuario");

    const academyDetailRequest = new Request(
      `http://localhost/administracion/usuarios/${academyUser.userId}`,
      {
        headers: {
          cookie: adminRequest.headers.get("cookie") ?? "",
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
    expect(academyMarkup).toContain("lucide-lock");
    expect(academyMarkup).not.toContain("Detalle del Usuario");
    expect(academyMarkup).not.toContain(
      `/administracion/academias/${academyUser.academy.id}`,
    );
    expect(academyMarkup).not.toContain("Permiso principal");
    expect(academyMarkup).not.toContain("Suspender usuario");
    expect(academyMarkup).not.toContain("Restablecer contraseña");
    expect(academyMarkup).not.toContain("Cambiar contraseña");
    expect(listData).not.toHaveProperty("email");
    expect(listData).not.toHaveProperty("eventOptions");
    expect(listData).not.toHaveProperty("selectedEventId");
    expect(internalDetailData).not.toHaveProperty("email");
    expect(internalDetailData).not.toHaveProperty("eventOptions");
    expect(internalDetailData).not.toHaveProperty("selectedEventId");
  });

  // #715: the list and the detail used to call every academy row "Activo"
  // before reading `suspended`, while login and `Recuperación de acceso`
  // refused it, so the admin saw a healthy user who could not get in.
  test("shows a suspended academy user as suspended in the list and the detail, and only under the suspended filter", async () => {
    const suspendedAcademy = await createAcademyUser({
      email: "academia.suspendida@example.com",
      academyName: "Academia Suspendida",
      contactName: "Sofía Suspendida",
      name: "Sofía Suspendida",
      suspended: true,
    });
    const { request: adminRequest } = await createSignedInRequest({
      email: "admin.academia.suspendida@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios",
      name: "Admin Suspensiones",
      internalUsername: "admin.suspensiones",
    });
    const cookie = adminRequest.headers.get("cookie") ?? "";
    const listUserIds = async (search: string) =>
      (
        await listLoader(
          listRouteArgs(
            new Request(`http://localhost/administracion/usuarios${search}`, {
              headers: { cookie },
            }),
          ),
        )
      ).users.map((listedUser) => listedUser.id);

    expect(await listUserIds("")).not.toContain(suspendedAcademy.userId);
    expect(await listUserIds("?estado=active")).not.toContain(
      suspendedAcademy.userId,
    );

    const suspendedList = await listLoader(
      listRouteArgs(
        new Request(
          "http://localhost/administracion/usuarios?estado=suspended",
          {
            headers: { cookie },
          },
        ),
      ),
    );

    expect(suspendedList.users).toEqual([
      expect.objectContaining({
        id: suspendedAcademy.userId,
        state: "suspended",
        userType: "academy",
      }),
    ]);
    expect(renderListRoute(suspendedList)).toContain("Suspendido");

    const detailData = await detailLoader(
      detailRouteArgs(
        new Request(
          `http://localhost/administracion/usuarios/${suspendedAcademy.userId}`,
          { headers: { cookie } },
        ),
        suspendedAcademy.userId,
      ),
    );

    expect(detailData.user.state).toBe("suspended");
    expect(renderDetailRoute(detailData, suspendedAcademy.userId)).toContain(
      "Suspendido",
    );
  });

  test("preserves the back-to-list search while removing detail-only search params", async () => {
    const targetUser = await createSignedInRequest({
      email: "usuario.ruta.detalle@example.com",
      role: "judge",
      requestUrl:
        "http://localhost/administracion/usuarios/placeholder?query=ada&estado=active",
      name: "Julia Ruta",
      internalUsername: "julia.ruta",
    });
    const { request: adminRequest } = await createSignedInRequest({
      email: "admin.ruta.detalle@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/usuarios/${targetUser.userId}?query=ada&estado=active&guardado=si&tipoGuardado=manual`,
      name: "Ada Ruta",
      internalUsername: "ada.ruta",
    });

    await expect(
      detailLoader(detailRouteArgs(adminRequest, targetUser.userId)),
    ).resolves.toMatchObject({
      backToList: "/administracion/usuarios?query=ada&estado=active",
    });
  });
});

function renderListRoute(
  loaderData: Partial<
    Parameters<typeof InternalUsersListRouteView>[0]["loaderData"]
  >,
) {
  const RoutesStub = createRoutesStub([
    {
      path: "/administracion/usuarios",
      Component: InternalUsersListRouteView,
    },
  ]);

  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: ["/administracion/usuarios"],
      hydrationData: {
        loaderData: {
          "0": {
            canWrite: true,
            filters: {
              query: "",
              state: null,
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
    Parameters<typeof InternalUserDetailRouteView>[0]["loaderData"]
  >,
  userId: string,
) {
  const RoutesStub = createRoutesStub([
    {
      path: "/administracion/usuarios/:userId",
      Component: InternalUserDetailRouteView,
    },
  ]);

  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: [`/administracion/usuarios/${userId}`],
      hydrationData: {
        loaderData: {
          "0": {
            canWrite: false,
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
    context: new RouterContextProvider(),
  });
}

function listRouteArgs(request: Request) {
  return routeArgs(request, "/administracion/usuarios");
}

function detailRouteArgs(request: Request, userId: string) {
  return routeArgs(request, "/administracion/usuarios/:userId", { userId });
}

import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { auth } from "@/lib/auth/auth.server";
import {
  loader as listLoader,
  AdministracionUsuariosRouteView,
} from "@/routes/administracion_.usuarios";
import {
  AdministracionUsuarioDetalleRouteView,
  loader as detailLoader,
} from "@/routes/administracion_.usuarios_.$userId";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion/usuarios/:userId route", () => {
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

    expect(listMarkup).toContain(
      `/administracion/usuarios/${internalUser.userId}`,
    );
    expect(listMarkup).toContain(
      `/administracion/usuarios/${academyUser.userId}`,
    );

    await expect(
      detailLoader(detailRouteArgs(adminRequest, internalUser.userId)),
    ).resolves.toMatchObject({
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
      await detailLoader(detailRouteArgs(adminRequest, internalUser.userId)),
      internalUser.userId,
    );

    expect(internalMarkup).toContain("Ada Admin");
    expect(internalMarkup).toContain("ada.admin");
    expect(internalMarkup).toContain("admin.detalle.usuario@example.com");
    expect(internalMarkup).toContain("Permiso principal");
    expect(internalMarkup).toContain("Administrador");
    expect(internalMarkup).toContain("Estado");
    expect(internalMarkup).toContain("Cambio obligatorio");
    expect(internalMarkup).not.toContain("Editar");
    expect(internalMarkup).not.toContain("Suspender Usuario");
    expect(internalMarkup).not.toContain("Restablecer contraseña");

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
            email: "admin@example.com",
            eventOptions: [],
            selectedEventId: null,
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
            email: "admin@example.com",
            eventOptions: [],
            selectedEventId: null,
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
}) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: input.email,
      name: input.userName,
      password: "password-segura",
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

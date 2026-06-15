import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { auth } from "@/lib/auth/auth.server";
import {
  AdministracionUsuariosRouteView,
  loader,
} from "@/routes/administracion_.usuarios";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion/usuarios route", () => {
  test("allows admin and auditor access, blocks academy and judge users, and renders the filtered Usuarios list", async () => {
    const admin = await createSignedInRequest({
      email: "admin.usuarios.lista@example.com",
      role: "admin",
      requiresPasswordChange: false,
      requestUrl: "http://localhost/administracion/usuarios",
      userName: "Ada Admin",
      internalUsername: "ada.admin",
    });
    const auditor = await createSignedInRequest({
      email: "auditor.usuarios.lista@example.com",
      role: "auditor",
      requiresPasswordChange: false,
      requestUrl: "http://localhost/administracion/usuarios",
      userName: "Ariel Auditor",
      internalUsername: "ariel.auditor",
    });
    const academyUser = await createAcademyUser({
      email: "academia.usuarios@example.com",
      academyName: "Academia Norte",
      contactName: "Nora Norte",
    });
    await createSignedInRequest({
      email: "judge.usuarios.lista@example.com",
      role: "judge",
      requiresPasswordChange: false,
      requestUrl: "http://localhost/administracion/usuarios",
      userName: "Joaquín Juez",
      internalUsername: "joaquin.juez",
    });
    await createSignedInRequest({
      email: "mandatorio.usuarios@example.com",
      role: "admin",
      requiresPasswordChange: true,
      requestUrl: "http://localhost/administracion/usuarios",
      userName: "Marta Mandatoria",
      internalUsername: "marta.mandatoria",
    });

    await expect(loader(routeArgs(admin.request))).resolves.toMatchObject({
      email: "admin.usuarios.lista@example.com",
    });
    await expect(loader(routeArgs(auditor.request))).resolves.toMatchObject({
      email: "auditor.usuarios.lista@example.com",
    });
    await expectThrownResponse(loader(routeArgs(academyUser.request)), 403);

    const { request: judgeRequest } = await createSignedInRequest({
      email: "judge.bloqueado@example.com",
      role: "judge",
      requiresPasswordChange: false,
      requestUrl: "http://localhost/administracion/usuarios",
      userName: "Julia Juez",
      internalUsername: "julia.juez",
    });
    await expectThrownResponse(loader(routeArgs(judgeRequest)), 403);

    const defaultData = await loader(routeArgs(admin.request));
    const defaultMarkup = renderRoute(defaultData);

    expect(defaultMarkup).toContain("Usuarios");
    expect(defaultMarkup).toContain("Nombre");
    expect(defaultMarkup).toContain("Identificador");
    expect(defaultMarkup).toContain("Estado");
    expect(defaultMarkup).toContain("Ada Admin");
    expect(defaultMarkup).toContain("Nora Norte");
    expect(defaultMarkup).toContain("ada.admin");
    expect(defaultMarkup).toContain("academia.usuarios@example.com");
    expect(defaultMarkup).toContain("Administrador");
    expect(defaultMarkup).toContain("Auditor");
    expect(defaultMarkup).toContain("Usuario de academia");
    expect(defaultMarkup).toContain("Interno");
    expect(defaultMarkup).toContain("Activo");
    expect(defaultMarkup).toContain("Cambio obligatorio");

    const byIdentifierRequest = await createSignedInRequest({
      email: "admin.busqueda.usuarios@example.com",
      role: "admin",
      requiresPasswordChange: false,
      requestUrl:
        "http://localhost/administracion/usuarios?q=ada.admin&estado=todos",
      userName: "Admin Búsqueda",
      internalUsername: "admin.busqueda",
    });
    const byIdentifierData = await loader(
      routeArgs(byIdentifierRequest.request),
    );

    expect(
      byIdentifierData.users.map((savedUser) => savedUser.identifier),
    ).toEqual(["ada.admin"]);

    const byNameRequest = await createSignedInRequest({
      email: "admin.nombre.usuarios@example.com",
      role: "admin",
      requiresPasswordChange: false,
      requestUrl:
        "http://localhost/administracion/usuarios?q=Nora+Norte&estado=todos",
      userName: "Admin Nombre",
      internalUsername: "admin.nombre",
    });
    const byNameData = await loader(routeArgs(byNameRequest.request));

    expect(byNameData.users.map((savedUser) => savedUser.name)).toEqual([
      "Nora Norte",
    ]);

    const byRoleRequest = await createSignedInRequest({
      email: "admin.rol.usuarios@example.com",
      role: "admin",
      requiresPasswordChange: false,
      requestUrl:
        "http://localhost/administracion/usuarios?permiso=auditor&estado=todos",
      userName: "Admin Rol",
      internalUsername: "admin.rol",
    });
    const byRoleData = await loader(routeArgs(byRoleRequest.request));

    expect(byRoleData.users.map((savedUser) => savedUser.mainRole)).toEqual([
      "auditor",
    ]);

    const byTypeRequest = await createSignedInRequest({
      email: "admin.tipo.usuarios@example.com",
      role: "admin",
      requiresPasswordChange: false,
      requestUrl:
        "http://localhost/administracion/usuarios?tipo=academy&estado=todos",
      userName: "Admin Tipo",
      internalUsername: "admin.tipo",
    });
    const byTypeData = await loader(routeArgs(byTypeRequest.request));

    expect(byTypeData.users.map((savedUser) => savedUser.userType)).toEqual([
      "academy",
    ]);

    const byStatusRequest = await createSignedInRequest({
      email: "admin.estado.usuarios@example.com",
      role: "admin",
      requiresPasswordChange: false,
      requestUrl:
        "http://localhost/administracion/usuarios?estado=mandatory-password-change",
      userName: "Admin Estado",
      internalUsername: "admin.estado",
    });
    const byStatusData = await loader(routeArgs(byStatusRequest.request));

    expect(
      byStatusData.users.every(
        (savedUser) => savedUser.state === "mandatory-password-change",
      ),
    ).toBe(true);
  });
});

function renderRoute(
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
            email: "admin@example.com",
            users: [],
            filters: {
              query: "",
              role: "all",
              state: "all",
              type: "all",
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
  email: string;
  academyName: string;
  contactName: string;
}) {
  const academyUser = await createSignedInRequest({
    email: input.email,
    role: "academy",
    requestUrl: "http://localhost/administracion/usuarios",
    userName: input.contactName,
  });

  await db.insert(academies).values({
    userId: academyUser.userId,
    name: input.academyName,
    contactName: input.contactName,
    phone: "1111-1111",
  });

  return academyUser;
}

function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/usuarios",
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

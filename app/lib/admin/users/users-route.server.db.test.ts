import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub, RouterContextProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createAcademyUser } from "@/lib/test-support/academies";
import { user } from "@/db/schema";
import { expectThrownResponse } from "@/lib/test-support/http";
import {
  InternalUsersListRouteView,
  loader,
} from "@/routes/administracion.usuarios";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("`/administracion/usuarios` route", () => {
  test("allows admin access, blocks auditor, academy and judge users, and renders the filtered users list", async () => {
    const admin = await createSignedInRequest({
      email: "admin.usuarios.lista@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios",
      name: "Ada Admin",
      internalUsername: "ada.admin",
    });
    const auditor = await createSignedInRequest({
      email: "auditor.usuarios.lista@example.com",
      role: "auditor",
      requestUrl: "http://localhost/administracion/usuarios",
      name: "Ariel Auditor",
      internalUsername: "ariel.auditor",
    });
    const academyUser = await createAcademyUser({
      email: "academia.usuarios@example.com",
      academyName: "Academia Norte",
      contactName: "Nora Norte",
      name: "Nora Norte",
    });
    await createSignedInRequest({
      email: "judge.usuarios.lista@example.com",
      role: "judge",
      requestUrl: "http://localhost/administracion/usuarios",
      name: "Joaquín Juez",
      internalUsername: "joaquin.juez",
    });
    const suspendedUser = await createSignedInRequest({
      email: "suspendido.usuarios@example.com",
      role: "judge",
      requestUrl: "http://localhost/administracion/usuarios",
      name: "Susana Suspendida",
      internalUsername: "susana.suspendida",
    });
    await db
      .update(user)
      .set({ suspended: true })
      .where(eq(user.id, suspendedUser.userId));

    await expect(loader(routeArgs(admin.request))).resolves.toMatchObject({
      canManage: true,
    });
    // Users are not reviewed for the auditor yet (PRD #1448).
    await expectThrownResponse(loader(routeArgs(auditor.request)), 403);
    await expectThrownResponse(
      loader(
        routeArgs(
          new Request("http://localhost/administracion/usuarios", {
            headers: { cookie: academyUser.cookie },
          }),
        ),
      ),
      403,
    );

    const { request: judgeRequest } = await createSignedInRequest({
      email: "judge.bloqueado@example.com",
      role: "judge",
      requestUrl: "http://localhost/administracion/usuarios",
      name: "Julia Juez",
      internalUsername: "julia.juez",
    });
    await expectThrownResponse(loader(routeArgs(judgeRequest)), 403);

    const defaultData = await loader(routeArgs(admin.request));
    const defaultMarkup = renderRoute(defaultData);

    expect(defaultData).not.toHaveProperty("email");
    expect(defaultData).not.toHaveProperty("eventOptions");
    expect(defaultData).not.toHaveProperty("selectedEventId");
    expect(defaultMarkup).toContain("Usuarios");
    expect(defaultMarkup).toContain("Nombre");
    expect(defaultMarkup).toContain("Academia");
    expect(defaultMarkup).toContain("Estado");
    expect(defaultMarkup).toContain("Ada Admin");
    expect(defaultMarkup).toContain("Nora Norte");
    expect(defaultMarkup).toContain("Administrador");
    expect(defaultMarkup).toContain("Auditor");
    expect(defaultMarkup).toContain("Academia Norte");
    expect(defaultMarkup).not.toContain("Identificador");
    expect(defaultMarkup).not.toContain("ada.admin");
    expect(defaultMarkup).not.toContain("academia.usuarios@example.com");
    expect(defaultMarkup).toContain("Activo");
    expect(defaultMarkup).not.toContain("Susana Suspendida");
    expect(defaultMarkup).not.toContain("susana.suspendida");

    const byIdentifierRequest = await createSignedInRequest({
      email: "admin.busqueda.usuarios@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios?busqueda=ada.admin",
      name: "Admin Búsqueda",
      internalUsername: "admin.busqueda",
    });
    const byIdentifierData = await loader(
      routeArgs(byIdentifierRequest.request),
    );

    expect(
      byIdentifierData.users.map((savedUser) => savedUser.identifier),
    ).toEqual(["ada.admin"]);

    const legacyQueryRequest = await createSignedInRequest({
      email: "admin.legacy-query.usuarios@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios?q=ada.admin",
      name: "Admin Legacy",
      internalUsername: "admin.legacy",
    });
    const legacyQueryRedirect = await expectThrownResponse(
      loader(routeArgs(legacyQueryRequest.request)),
      302,
    );

    // `q` is not this product's vocabulary: it is dropped, not read.
    expect(legacyQueryRedirect.headers.get("Location")).toBe(
      "/administracion/usuarios",
    );

    const byNameRequest = await createSignedInRequest({
      email: "admin.nombre.usuarios@example.com",
      role: "admin",
      requestUrl:
        "http://localhost/administracion/usuarios?busqueda=Nora+Norte",
      name: "Admin Nombre",
      internalUsername: "admin.nombre",
    });
    const byNameData = await loader(routeArgs(byNameRequest.request));

    expect(byNameData.users.map((savedUser) => savedUser.name)).toEqual([
      "Nora Norte",
    ]);

    const byTypeRequest = await createSignedInRequest({
      email: "admin.tipo.usuarios@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios?tipo=academy",
      name: "Admin Tipo",
      internalUsername: "admin.tipo",
    });
    const byTypeData = await loader(routeArgs(byTypeRequest.request));

    expect(byTypeData.users.map((savedUser) => savedUser.userType)).toEqual([
      "academy",
    ]);

    const byStatusRequest = await createSignedInRequest({
      email: "admin.estado.usuarios@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios?estado=suspended",
      name: "Admin Estado",
      internalUsername: "admin.estado",
    });
    const byStatusData = await loader(routeArgs(byStatusRequest.request));

    expect(
      byStatusData.users.every((savedUser) => savedUser.state === "suspended"),
    ).toBe(true);

    const byRoleRequest = await createSignedInRequest({
      email: "admin.rol.usuarios@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios?rol=auditor",
      name: "Admin Rol",
      internalUsername: "admin.rol",
    });
    const byRoleData = await loader(routeArgs(byRoleRequest.request));

    expect(byRoleData.users.map((savedUser) => savedUser.mainRole)).toEqual([
      "auditor",
    ]);

    const bySuspendedStatusRequest = await createSignedInRequest({
      email: "admin.suspendidos.usuarios@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios?estado=suspended",
      name: "Admin Suspendidos",
      internalUsername: "admin.suspendidos",
    });
    const bySuspendedStatusData = await loader(
      routeArgs(bySuspendedStatusRequest.request),
    );

    expect(
      bySuspendedStatusData.users.map((savedUser) => savedUser.identifier),
    ).toEqual(["susana.suspendida"]);
  });

  test("finds an academy by email and never an internal user by their credential email", async () => {
    await createSignedInRequest({
      email: "juez.correo@enescena.com.ar",
      role: "judge",
      requestUrl: "http://localhost/administracion/usuarios",
      name: "Juan Juez",
      internalUsername: "juez.correo",
    });
    await createAcademyUser({
      email: "contacto@academia-sur.com",
      academyName: "Academia Sur",
      contactName: "Sara Sur",
      name: "Sara Sur",
    });

    const byInternalEmail = await loader(
      routeArgs(
        (
          await createSignedInRequest({
            email: "admin.correo.interno@enescena.com.ar",
            role: "admin",
            requestUrl:
              "http://localhost/administracion/usuarios?busqueda=juez.correo%40enescena.com.ar",
            name: "Admin Correo Interno",
            internalUsername: "admin.correo.interno",
          })
        ).request,
      ),
    );

    expect(byInternalEmail.users).toEqual([]);

    const byAcademyEmail = await loader(
      routeArgs(
        (
          await createSignedInRequest({
            email: "admin.correo.academia@enescena.com.ar",
            role: "admin",
            requestUrl:
              "http://localhost/administracion/usuarios?busqueda=contacto%40academia-sur.com",
            name: "Admin Correo Academia",
            internalUsername: "admin.correo.academia",
          })
        ).request,
      ),
    );

    expect(byAcademyEmail.users.map((savedUser) => savedUser.name)).toEqual([
      "Sara Sur",
    ]);
  });
});

function renderRoute(
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
            users: [],
            filters: {
              query: "",
              role: "all",
              state: null,
              type: "all",
            },
            ...loaderData,
          },
        },
      },
    }),
  );
}

function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: new RouterContextProvider(),
    url: new URL(request.url),
    pattern: "/administracion/usuarios",
  };
}

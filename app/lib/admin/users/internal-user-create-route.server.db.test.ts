import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { user } from "@/db/schema";
import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import {
  AdministracionUsuariosNuevoRouteView,
  action,
  loader,
} from "@/routes/administracion.usuarios_.nuevo";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion/usuarios/nuevo route", () => {
  test("requires admin access and renders the temporary password warning", async () => {
    await expectThrownResponse(
      loader(
        routeArgs(
          new Request("http://localhost/administracion/usuarios/nuevo"),
        ),
      ),
      302,
    );

    const { request } = await createSignedInRequest({
      email: "admin.usuarios@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios/nuevo",
    });

    const loaderData = await loader(routeArgs(request));
    const markup = renderRoute();

    expect(loaderData).not.toHaveProperty("email");
    expect(loaderData).not.toHaveProperty("eventOptions");
    expect(loaderData).not.toHaveProperty("selectedEventId");
    expect(markup).toContain("Nuevo usuario");
    expect(markup).toContain("Contraseña temporal");
    expect(markup).toContain("canal seguro");
    expect(markup).not.toContain("Usuario interno creado");
  });

  test("creates an internal judge user and redirects with a toast notification without revealing the temporary password", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.crea.usuario@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios/nuevo",
      body: userFormData({
        name: "Mesa de Jueces",
        internalUsername: "Mesa.Jueces",
        role: "judge",
        temporaryPassword: "temporal-segura",
        email: "",
      }),
    });

    const response = await expectThrownResponse(
      action(routeArgs(request)),
      302,
    );
    const savedUser = await db.query.user.findFirst({
      where: eq(user.internalUsername, "mesa.jueces"),
    });

    expect(savedUser).toMatchObject({
      name: "Mesa de Jueces",
      role: "judge",
      requiresPasswordChange: true,
    });
    expect(response.headers.get("location")).toBe(
      "/administracion/usuarios/nuevo?notificacion=usuario-interno-creado",
    );
    expect(response.headers.get("location")).not.toContain("temporal-segura");
  });
});

function renderRoute() {
  const RoutesStub = createRoutesStub([
    {
      path: "/administracion/usuarios/nuevo",
      Component: AdministracionUsuariosNuevoRouteView,
    },
  ]);

  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: ["/administracion/usuarios/nuevo"],
      hydrationData: {
        loaderData: { "0": {} },
      },
    }),
  );
}

function userFormData(input: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(input)) {
    formData.set(key, value);
  }

  return formData;
}

function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/usuarios/nuevo",
  };
}

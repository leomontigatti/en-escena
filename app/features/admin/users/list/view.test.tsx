import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { InternalUsersListRouteView } from "@/features/admin/users/list/view";
import { renderInDataRouter } from "@/lib/test-support/data-router";

describe("InternalUsersListRouteView", () => {
  test("keeps filtered empty results inside the users table", () => {
    const markup = renderRoute({
      canWrite: true,
      filters: {
        linkState: null,
        page: 1,
        query: "Sin resultados",
        role: "all",
        state: null,
        type: "all",
      },
    });

    expect(markup).toContain("Buscar por nombre o email");
    expect(markup).toContain('value="Sin resultados"');
    expect(markup).toContain(
      "No hay usuarios que coincidan con la búsqueda o los filtros.",
    );
    expect(markup).not.toContain("Todavía no hay usuarios.");
  });

  test("keeps active list filters when linking to a user detail", () => {
    const markup = renderRoute({
      filters: {
        linkState: null,
        page: 1,
        query: "Ana Admin",
        role: "admin",
        state: "suspended",
        type: "internal",
      },
      users: [
        {
          academyName: null,
          id: "user-1",
          identifier: "ana.admin",
          linkState: null,
          mainRole: "admin",
          name: "Ana Admin",
          state: "suspended",
          userType: "internal",
        },
      ],
    });

    expect(markup).toContain(
      'href="/administracion/usuarios/user-1?busqueda=Ana+Admin&amp;estado=suspended&amp;rol=admin&amp;tipo=internal"',
    );
  });

  // It used to render one page whatever the list held, so the control
  // promised paging it could not do.
  test("pages from the totals the loader counted", () => {
    const markup = renderRoute({
      filters: {
        linkState: null,
        page: 2,
        query: "",
        role: "all",
        state: null,
        type: "all",
      },
      totalCount: 51,
      totalPages: 2,
      users: [
        {
          academyName: null,
          id: "user-51",
          identifier: "juez.51",
          linkState: null,
          mainRole: "judge",
          name: "Juez 51",
          state: "active",
          userType: "internal",
        },
      ],
    });

    expect(markup).toContain("1 de 51 registros");
    expect(markup).toContain('href="/administracion/usuarios"');
  });

  test("shows an individual's link in administration's words beside its permission", () => {
    const individual = {
      academyName: null,
      identifier: "ana@example.com",
      mainRole: "individual" as const,
      name: "Ana",
      state: "active" as const,
      userType: "individual" as const,
    };
    const markup = renderRoute({
      users: [
        { ...individual, id: "user-1", linkState: "unlinked" },
        { ...individual, id: "user-2", linkState: "pending" },
        { ...individual, id: "user-3", linkState: "linked" },
      ],
    });

    expect(markup).toContain("Particular");
    expect(markup).toContain("Incompleto");
    expect(markup).toContain("Sin verificar");
    expect(markup).toContain("Vinculado");
    expect(markup).not.toContain("Sin vincular");
    expect(markup).not.toContain("Pendiente");
  });

  test("links the header action to the create page for a managing user", () => {
    const markup = renderRoute({ canWrite: true });

    expect(markup).toContain('href="/administracion/usuarios/nuevo"');
    expect(markup).toContain("Nuevo usuario");
  });

  test("hides the header action when the user cannot manage users", () => {
    const markup = renderRoute({ canWrite: false });

    expect(markup).not.toContain('href="/administracion/usuarios/nuevo"');
    expect(markup).not.toContain("Nuevo usuario");
  });
});

function renderRoute(
  loaderData: Partial<
    Parameters<typeof InternalUsersListRouteView>[0]["loaderData"]
  > = {},
) {
  return renderToStaticMarkup(
    renderInDataRouter(
      "/administracion/usuarios",
      createElement(InternalUsersListRouteView, {
        loaderData: {
          canWrite: false,
          filters: {
            linkState: null,
            page: 1,
            query: "",
            role: "all",
            state: null,
            type: "all",
          },
          totalCount: 0,
          totalPages: 1,
          users: [],
          ...loaderData,
        },
      }),
    ),
  );
}

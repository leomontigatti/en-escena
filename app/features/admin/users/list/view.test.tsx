import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { InternalUsersListRouteView } from "@/features/admin/users/list/view";

describe("InternalUsersListRouteView", () => {
  test("keeps filtered empty results inside the users table", () => {
    const markup = renderRoute({
      canManage: true,
      filters: {
        archived: false,
        page: 1,
        query: "Sin resultados",
        role: "all",
        state: "all",
        type: "all",
      },
    });

    expect(markup).toContain("Buscar usuario por nombre o email");
    expect(markup).toContain('value="Sin resultados"');
    expect(markup).toContain(
      "No hay usuarios que coincidan con la búsqueda o los filtros.",
    );
    expect(markup).not.toContain("Todavía no hay usuarios.");
  });

  test("keeps active list filters when linking to a user detail", () => {
    const markup = renderRoute({
      filters: {
        archived: true,
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
          mainRole: "admin",
          name: "Ana Admin",
          state: "suspended",
          userType: "internal",
        },
      ],
    });

    expect(markup).toContain(
      'href="/administracion/usuarios/user-1?busqueda=Ana+Admin&amp;estado=suspended&amp;rol=admin&amp;tipo=internal&amp;archivado=si"',
    );
  });

  // It used to render one page whatever the list held, so the control
  // promised paging it could not do.
  test("pages from the totals the loader counted", () => {
    const markup = renderRoute({
      filters: {
        archived: false,
        page: 2,
        query: "",
        role: "all",
        state: "all",
        type: "all",
      },
      totalCount: 51,
      totalPages: 2,
      users: [
        {
          academyName: null,
          id: "user-51",
          identifier: "juez.51",
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

  test("links the header action to the create page for a managing user", () => {
    const markup = renderRoute({ canManage: true });

    expect(markup).toContain('href="/administracion/usuarios/nuevo"');
    expect(markup).toContain("Nuevo usuario");
  });

  test("hides the header action when the user cannot manage users", () => {
    const markup = renderRoute({ canManage: false });

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
    createElement(
      MemoryRouter,
      { initialEntries: ["/administracion/usuarios"] },
      createElement(InternalUsersListRouteView, {
        loaderData: {
          canManage: false,
          filters: {
            archived: false,
            page: 1,
            query: "",
            role: "all",
            state: "all",
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

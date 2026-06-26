import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { AdministracionUsuariosRouteView } from "@/features/admin/users/list/view";

describe("AdministracionUsuariosRouteView", () => {
  test("keeps filtered empty results inside the Usuarios table", () => {
    const markup = renderRoute({
      canManage: true,
      filters: {
        archived: false,
        query: "Sin resultados",
        role: "all",
        state: "all",
        type: "all",
      },
    });

    expect(markup).toContain("Buscar usuario por nombre o email");
    expect(markup).toContain('value="Sin resultados"');
    expect(markup).toContain(
      "No hay Usuarios que coincidan con la búsqueda o los filtros.",
    );
    expect(markup).not.toContain("No hay Usuarios para mostrar.");
  });
});

function renderRoute(
  loaderData: Partial<
    Parameters<typeof AdministracionUsuariosRouteView>[0]["loaderData"]
  > = {},
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/administracion/usuarios"] },
      createElement(AdministracionUsuariosRouteView, {
        loaderData: {
          canManage: false,
          filters: {
            archived: false,
            query: "",
            role: "all",
            state: "all",
            type: "all",
          },
          users: [],
          ...loaderData,
        },
      }),
    ),
  );
}

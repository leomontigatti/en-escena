import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";

import { AdministracionUsuariosNuevoRouteView } from "@/features/admin/users/create/view";

describe("AdministracionUsuariosNuevoRouteView", () => {
  test("renders the temporary password warning without showing a success toast", () => {
    const RoutesStub = createRoutesStub([
      {
        path: "/administracion/usuarios/nuevo",
        Component: AdministracionUsuariosNuevoRouteView,
      },
    ]);

    const markup = renderToStaticMarkup(
      createElement(RoutesStub, {
        initialEntries: ["/administracion/usuarios/nuevo"],
      }),
    );

    expect(markup).toContain("Nuevo usuario");
    expect(markup).toContain("Contraseña temporal");
    expect(markup).toContain("canal seguro");
    expect(markup).not.toContain("Usuario interno creado");
  });
});

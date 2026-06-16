import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/admin/event-context.server", () => ({
  loadAdminEventContext: vi.fn(),
}));

vi.mock("@/lib/auth/internal-navigation.server", () => ({
  requireAdminPanelUser: vi.fn(),
}));

import { AdministracionRouteView } from "@/routes/administracion";
import {
  AdministracionUsuariosNuevoRouteView,
  handle as createUserHandle,
} from "@/routes/administracion.usuarios_.nuevo";

describe("administracion layout route", () => {
  test("renders the administrative shell around the migrated Usuarios creation route", () => {
    const RoutesStub = createRoutesStub([
      {
        path: "/administracion",
        Component: () => (
          <AdministracionRouteView
            loaderData={{
              email: "admin@example.com",
              events: [
                { id: "evento_2026", name: "Evento 2026", active: true },
              ],
              selectedEventId: "evento_2026",
            }}
          />
        ),
        children: [
          {
            path: "usuarios/nuevo",
            handle: createUserHandle,
            Component: () => (
              <AdministracionUsuariosNuevoRouteView loaderData={{}} />
            ),
          },
        ],
      },
    ]);

    const markup = renderToStaticMarkup(
      createElement(RoutesStub, {
        initialEntries: ["/administracion/usuarios/nuevo"],
      }),
    );

    expect(markup).toContain("Crear Usuario interno");
    expect(markup).toContain("admin@example.com");
    expect(markup).toContain("Saltar al contenido principal");
    expect(markup).toContain('href="/administracion/usuarios"');
    expect(markup).toContain("En Escena");
    expect(markup).not.toContain("Evento activo");
  });
});

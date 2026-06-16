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
import { handle as modalityDetailHandle } from "@/routes/administracion.modalidades_.$modalityId";

describe("administracion layout route", () => {
  test("renders the administrative shell around child outlet content", () => {
    const RoutesStub = createRoutesStub([
      {
        path: "/administracion",
        Component: AdministracionRouteView,
        children: [
          {
            path: "usuarios/nuevo",
            handle: {
              adminBreadcrumbs: [
                { label: "Usuarios", to: "/administracion/usuarios" },
                { label: "Crear Usuario interno" },
              ],
              adminShell: { showEventSelector: false },
            },
            Component: () => <h1>Crear Usuario interno</h1>,
          },
        ],
      },
    ]);

    const markup = renderToStaticMarkup(
      createElement(RoutesStub, {
        initialEntries: ["/administracion/usuarios/nuevo"],
        hydrationData: {
          loaderData: {
            "0": {
              email: "admin@example.com",
              events: [
                { id: "evento_2026", name: "Evento 2026", active: true },
              ],
              selectedEventId: "evento_2026",
            },
          },
        },
      }),
    );

    expect(markup).toContain("Crear Usuario interno");
    expect(markup).toContain("admin@example.com");
    expect(markup).toContain("Saltar al contenido principal");
    expect(markup).toContain('href="/administracion/usuarios"');
    expect(markup).toContain("En Escena");
    expect(markup).not.toContain("Evento activo");
  });

  test("collects Bases del evento dynamic breadcrumbs from child route metadata", () => {
    const RoutesStub = createRoutesStub([
      {
        path: "/administracion",
        Component: AdministracionRouteView,
        children: [
          {
            path: "modalidades/:modalityId",
            handle: modalityDetailHandle,
            Component: () => <h1>Detalle de modalidad</h1>,
          },
        ],
      },
    ]);

    const markup = renderToStaticMarkup(
      createElement(RoutesStub, {
        initialEntries: ["/administracion/modalidades/mod_1"],
        hydrationData: {
          loaderData: {
            "0": {
              email: "admin@example.com",
              events: [
                { id: "evento_2026", name: "Evento 2026", active: true },
              ],
              selectedEventId: "evento_2026",
            },
            "0-0": {
              selectedEventId: "evento_2026",
              modalities: [{ id: "mod_1", name: "Jazz Contemporáneo" }],
              submodalities: [],
              experienceLevels: [],
              categories: [],
              scheduleBlocks: [],
              prices: [],
            },
          },
        },
      }),
    );

    expect(markup).toContain("Detalle de modalidad");
    expect(markup).toContain('href="/administracion/modalidades"');
    expect(markup).toContain("Jazz Contemporáneo");
    expect(markup).toContain("Evento activo");
  });
});

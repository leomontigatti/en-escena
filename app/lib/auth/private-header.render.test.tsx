import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/internal-access.server", () => ({
  requireAcademyUser: vi.fn(),
}));

vi.mock("@/lib/auth/internal-navigation.server", () => ({
  requireAdminPanelUser: vi.fn(),
  requireAuditorPanelUser: vi.fn(),
  requireJudgePanelUser: vi.fn(),
}));

import { AdministracionRouteView } from "@/routes/administracion";
import { AuditoriaRouteView } from "@/routes/auditoria";
import { JuzgamientoRouteView } from "@/routes/juzgamiento";
import { PortalRouteView } from "@/routes/portal";

describe("private route headers", () => {
  test.each([
    [
      "portal de academias",
      renderPortal("portal@example.com"),
      "portal@example.com",
    ],
    [
      "auditoría",
      renderPrivateRoute(
        <AuditoriaRouteView loaderData={{ email: "auditoria@example.com" }} />,
      ),
      "auditoria@example.com",
    ],
    [
      "juzgamiento",
      renderPrivateRoute(
        <JuzgamientoRouteView
          loaderData={{ email: "juzgamiento@example.com" }}
        />,
      ),
      "juzgamiento@example.com",
    ],
  ])("%s renders the shared private header", (_name, markup, email) => {
    expect(markup).toContain(email);
    expect(markup).toContain("Sesión activa para");
    expect(markup).toContain("<span>Salir</span>");
    expect(markup).toContain('action="/salir"');
    expect(markup).toContain('method="post"');
  });

  test("panel de administración renders session context in the sidebar dropdown trigger", () => {
    const markup = renderPrivateRoute(
      <AdministracionRouteView
        loaderData={{
          email: "admin@example.com",
          events: [{ id: "evento_2026", name: "Evento 2026", active: true }],
          selectedEventId: "evento_2026",
        }}
      />,
    );

    expect(markup).toContain("admin@example.com");
    expect(markup).toContain("Usuario interno");
    expect(markup).not.toContain("Sesión activa para");
  });

  test("auditoría renders shared readonly consultation links", () => {
    const markup = renderPrivateRoute(
      <AuditoriaRouteView loaderData={{ email: "auditoria@example.com" }} />,
    );

    expect(markup).toContain("Consulta interna");
    expect(markup).toContain("Panel de administración");
    expect(markup).toContain("Evento activo");

    for (const [href, label] of [
      ["/administracion/profesores", "Profesores"],
      ["/administracion/bailarines", "Bailarines"],
    ] as const) {
      expect(markup).toContain(`href="${href}"`);
      expect(markup).toContain(label);
    }
  });
});

function renderPortal(email: string) {
  const loaderData = {
    email,
    academy: {
      id: "academy_1",
      userId: "user_1",
      name: "Academia de Prueba",
      contactName: "Contacto",
      phone: "11 1234-5678",
    },
    eventContext: {
      events: [],
      selectedEvent: null,
      activeEvent: null,
      hasActiveEvent: false,
      activeEventRegistrationReadiness: null,
      hasEvents: false,
      isReadOnly: true,
      isRegistrationOpen: false,
    },
  };
  return renderPrivateRoute(<PortalRouteView loaderData={loaderData} />);
}

function renderPrivateRoute(route: ReactElement) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>{route}</MemoryRouter>,
  );
}

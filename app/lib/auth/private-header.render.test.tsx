import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactElement } from "react";
import { readFileSync } from "node:fs";
import { createRoutesStub, MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { PortalShell } from "@/components/portal/ui";

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

describe("private route headers", () => {
  test.each([
    [
      "portal de academias",
      renderPortal("portal@example.com"),
      "Contacto",
      false,
    ],
    [
      "auditoría",
      renderPrivateRoute(
        <AuditoriaRouteView loaderData={{ email: "auditoria@example.com" }} />,
      ),
      "auditoria@example.com",
      true,
    ],
    [
      "juzgamiento",
      renderPrivateRoute(
        <JuzgamientoRouteView
          loaderData={{ email: "juzgamiento@example.com" }}
        />,
      ),
      "juzgamiento@example.com",
      true,
    ],
  ])(
    "%s renders the expected signed-in session context",
    (_name, markup, sessionLabel, usesLegacyHeader) => {
      expect(markup).toContain(sessionLabel);

      if (usesLegacyHeader) {
        expect(markup).toContain("Sesión activa para");
        expect(markup).toContain("Salir");
        expect(markup).toContain('action="/salir"');
        expect(markup).toContain('method="post"');
      } else {
        expect(markup).not.toContain("Sesión activa para");
        expect(markup).toContain("Portal de academias");
        expect(markup).toContain("Academia de Prueba");
      }
    },
  );

  test("panel de administración renders session context in the sidebar dropdown trigger", () => {
    const markup = renderAdminRoute();

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

  test("admin, auditoría y root error usan tokens semánticos en sus superficies compartidas", () => {
    const adminMarkup = renderAdminRoute();
    const auditoriaMarkup = renderPrivateRoute(
      <AuditoriaRouteView loaderData={{ email: "auditoria@example.com" }} />,
    );
    const rootSource = readFileSync("app/root.tsx", "utf8");

    expect(adminMarkup).toContain("focus-visible:bg-background");
    expect(adminMarkup).toContain("focus-visible:text-foreground");
    expect(adminMarkup).toContain("focus-visible:ring-ring/50");
    expect(adminMarkup).not.toContain("focus-visible:bg-white");
    expect(adminMarkup).not.toContain("focus-visible:text-slate-950");
    expect(adminMarkup).not.toContain("focus-visible:ring-teal-100");

    expect(auditoriaMarkup).toContain("border-border");
    expect(auditoriaMarkup).toContain("bg-card");
    expect(auditoriaMarkup).toContain("text-card-foreground");
    expect(auditoriaMarkup).toContain("text-muted-foreground");
    expect(auditoriaMarkup).toContain("hover:bg-accent");
    expect(auditoriaMarkup).toContain("hover:border-accent");
    expect(auditoriaMarkup).toContain("focus-visible:ring-ring/50");
    expect(auditoriaMarkup).not.toContain("border-slate-200");
    expect(auditoriaMarkup).not.toContain("bg-white");
    expect(auditoriaMarkup).not.toContain("bg-slate-50");
    expect(auditoriaMarkup).not.toContain("text-slate-950");
    expect(auditoriaMarkup).not.toContain("text-slate-600");
    expect(auditoriaMarkup).not.toContain("hover:bg-teal-50");
    expect(auditoriaMarkup).not.toContain("hover:border-teal-300");
    expect(auditoriaMarkup).not.toContain("focus-visible:ring-teal-100");

    expect(rootSource).toContain("border-border");
    expect(rootSource).toContain("bg-card");
    expect(rootSource).toContain("text-card-foreground");
    expect(rootSource).toContain("text-muted-foreground");
    expect(rootSource).not.toContain("border-slate-200");
    expect(rootSource).not.toContain("bg-white");
    expect(rootSource).not.toContain("text-slate-500");
    expect(rootSource).not.toContain("text-slate-950");
    expect(rootSource).not.toContain("text-slate-600");
  });
});

function renderAdminRoute() {
  const RoutesStub = createRoutesStub([
    {
      path: "/administracion",
      Component: AdministracionRouteView,
    },
  ]);

  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: ["/administracion"],
      hydrationData: {
        loaderData: {
          "0": {
            email: "admin@example.com",
            events: [{ id: "evento_2026", name: "Evento 2026", active: true }],
            selectedEventId: "evento_2026",
          },
        },
      },
    }),
  );
}

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
  return renderPrivateRoute(
    <PortalShell
      userEmail={loaderData.email}
      contactName={loaderData.academy.contactName}
      academyName={loaderData.academy.name}
      eventContext={loaderData.eventContext}
      breadcrumbItems={[{ label: "Inicio" }]}
    >
      <></>
    </PortalShell>,
  );
}

function renderPrivateRoute(route: ReactElement) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>{route}</MemoryRouter>,
  );
}

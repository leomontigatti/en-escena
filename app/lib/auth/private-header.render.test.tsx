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

    expectClassFragments(adminMarkup, {
      includes: [
        "focus-visible:bg-background",
        "focus-visible:text-foreground",
        "focus-visible:ring-ring/50",
      ],
      excludes: [
        "focus-visible:bg-white",
        "focus-visible:text-slate-950",
        "focus-visible:ring-teal-100",
      ],
    });

    expectClassFragments(auditoriaMarkup, {
      includes: [
        "border-border",
        "bg-card",
        "text-card-foreground",
        "text-muted-foreground",
        "hover:bg-accent",
        "hover:border-accent",
        "focus-visible:ring-ring/50",
      ],
      excludes: [
        "border-slate-200",
        "bg-white",
        "bg-slate-50",
        "text-slate-950",
        "text-slate-600",
        "hover:bg-teal-50",
        "hover:border-teal-300",
        "focus-visible:ring-teal-100",
      ],
    });

    expectClassFragments(rootSource, {
      includes: [
        "border-border",
        "bg-card",
        "text-card-foreground",
        "text-muted-foreground",
      ],
      excludes: [
        "border-slate-200",
        "bg-white",
        "text-slate-500",
        "text-slate-950",
        "text-slate-600",
      ],
    });
  });
});

function expectClassFragments(
  markupOrSource: string,
  fragments: {
    includes: string[];
    excludes: string[];
  },
) {
  for (const classFragment of fragments.includes) {
    expect(markupOrSource).toContain(classFragment);
  }

  for (const classFragment of fragments.excludes) {
    expect(markupOrSource).not.toContain(classFragment);
  }
}

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
      activeEvent: null,
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

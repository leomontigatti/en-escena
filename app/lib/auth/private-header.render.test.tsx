import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactElement } from "react";
import { createRoutesStub, MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { PortalShell } from "@/components/portal/ui";

vi.mock("@/lib/auth/internal-access.server", () => ({
  requireAcademyUser: vi.fn(),
}));

vi.mock("@/lib/auth/internal-navigation.server", () => ({
  requireAdminPanelReader: vi.fn(),
  requireJudgePanelUser: vi.fn(),
}));

import { AdminShellRouteView } from "@/routes/administracion";
import { JuzgamientoRouteView } from "@/routes/juzgamiento";

const judgeAccount = {
  name: "Juana Juez",
  roleLabel: "Juez",
  username: "juana.juez",
};

describe("private route headers", () => {
  test.each([
    [
      "portal de academias",
      renderPortal("portal@example.com"),
      "Contacto",
      false,
    ],
    [
      "juzgamiento",
      renderPrivateRoute(
        <JuzgamientoRouteView
          loaderData={{
            account: judgeAccount,
            day: "2026-08-22",
            dayOptions: [],
            finalistPicks: [],
            isOpen: true,
            judgingDate: "2026-08-22",
            presentations: [],
          }}
        />,
      ),
      "Juana Juez",
      true,
    ],
  ])(
    "%s renders the expected signed-in session context",
    (_name, markup, sessionLabel, usesInternalAccountHeader) => {
      expect(markup).toContain(sessionLabel);

      if (usesInternalAccountHeader) {
        expect(markup).not.toContain("Sesión activa para");
        expect(markup).not.toContain("@example.com");
        expect(markup).toContain("Salir");
        expect(markup).toContain('action="/salir"');
        expect(markup).toContain('method="post"');
      } else {
        expect(markup).not.toContain("Sesión activa para");
        expect(markup).toContain("Portal de academias");
      }
    },
  );

  test("admin panel renders session context in the account menu trigger", () => {
    const markup = renderAdminRoute();

    expect(markup).toContain("Cuenta: Ada Admin");
    expect(markup).not.toContain("admin@example.com");
    expect(markup).not.toContain("Sesión activa para");
  });
});

function renderAdminRoute() {
  const RoutesStub = createRoutesStub([
    {
      path: "/administracion",
      Component: AdminShellRouteView,
    },
  ]);

  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: ["/administracion"],
      hydrationData: {
        loaderData: {
          "0": {
            account: {
              name: "Ada Admin",
              roleLabel: "Administrador",
              username: "ada.admin",
            },
            canWrite: true,
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
      isRegistrationOpen: false,
    },
  };
  return renderPrivateRoute(
    <PortalShell
      userEmail={loaderData.email}
      contactName={loaderData.academy.contactName}
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

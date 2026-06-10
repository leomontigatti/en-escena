import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentType } from "react";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/internal-access.server", () => ({
  requireAcademyUser: vi.fn(),
}));

vi.mock("@/lib/internal-navigation.server", () => ({
  requireAdminPanelUser: vi.fn(),
  requireAuditorPanelUser: vi.fn(),
  requireJudgePanelUser: vi.fn(),
}));

import AdministracionRoute from "@/routes/administracion";
import AuditoriaRoute from "@/routes/auditoria";
import JuzgamientoRoute from "@/routes/juzgamiento";
import PortalRoute from "@/routes/portal";

type PanelRouteComponent = ComponentType<{
  loaderData: { email: string };
}>;

describe("private route headers", () => {
  test.each([
    [
      "portal de academias",
      renderPortal("portal@example.com"),
      "portal@example.com",
    ],
    [
      "panel de administración",
      renderPanel(
        AdministracionRoute as unknown as PanelRouteComponent,
        "admin@example.com",
      ),
      "admin@example.com",
    ],
    [
      "auditoría",
      renderPanel(
        AuditoriaRoute as unknown as PanelRouteComponent,
        "auditoria@example.com",
      ),
      "auditoria@example.com",
    ],
    [
      "juzgamiento",
      renderPanel(
        JuzgamientoRoute as unknown as PanelRouteComponent,
        "juzgamiento@example.com",
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
  };
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: PortalRoute,
      loader: () => loaderData,
    },
  ]);

  return renderToStaticMarkup(
    <Stub
      initialEntries={["/"]}
      hydrationData={{ loaderData: { "0": loaderData } }}
    />,
  );
}

function renderPanel(RouteComponent: PanelRouteComponent, email: string) {
  const loaderData = { email };
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: RouteComponent,
      loader: () => loaderData,
    },
  ]);

  return renderToStaticMarkup(
    <Stub
      initialEntries={["/"]}
      hydrationData={{ loaderData: { "0": loaderData } }}
    />,
  );
}

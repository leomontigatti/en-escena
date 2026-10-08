/** @vitest-environment jsdom */

import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  PortalShellErrorBoundary,
  PortalShellRouteView,
} from "@/features/portal/shell/view";
import {
  createReactDomTestRenderer,
  waitFor,
} from "@/lib/test-support/react-dom";

const shellData = {
  email: "academia@example.com",
  academy: { contactName: "Carla Contacto" },
  eventContext: { activeEvent: null, isRegistrationOpen: false },
};

describe("`/portal` error boundary", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("renders a screen's thrown Response inside the portal shell", async () => {
    const RoutesStub = createRoutesStub([
      {
        id: "routes/portal",
        path: "/portal",
        loader: () => shellData,
        Component: PortalShellRouteView,
        ErrorBoundary: PortalShellErrorBoundary,
        children: [
          {
            path: "profesores/:professorId",
            loader: () => {
              throw new Response("No encontramos ese Profesor.", {
                status: 404,
              });
            },
            Component: () => <h1>Detalle de profesor</h1>,
          },
        ],
      },
    ]);

    await renderer.renderAsync(
      <RoutesStub initialEntries={["/portal/profesores/no-existe"]} />,
    );

    const page = () => renderer.getContainer().textContent ?? "";

    await waitFor(() => page().includes("No encontramos ese Profesor."));
    expect(page()).toContain("Página no encontrada");
    expect(page()).toContain("Portal de academias");
    expect(page()).toContain("Saltar al contenido principal");
    expect(
      renderer.getContainer().querySelector('a[href="/portal/profesores"]'),
    ).not.toBeNull();
  });
});

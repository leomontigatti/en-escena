import { renderToStaticMarkup } from "react-dom/server";
import {
  createStaticHandler,
  createStaticRouter,
  type RouteObject,
  StaticRouterProvider,
  useLoaderData,
  useRouteError,
} from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/admin/event-context.server", () => ({
  loadShellEventContext: vi.fn(),
}));

vi.mock("@/lib/auth/internal-navigation.server", () => ({
  requireAdminPanelReader: vi.fn(),
}));

import { AdminShellRouteView, ErrorBoundary } from "@/routes/administracion";

const shellData = {
  account: {
    name: "Ada Admin",
    roleLabel: "Administrador",
    username: "ada.admin",
  },
  canWrite: true,
  events: [{ id: "evento_2026", name: "Evento 2026", active: true }],
  selectedEventId: "evento_2026",
};

/**
 * Renders `/administracion/academias/no-existe` the way the server does on a
 * direct load: the loaders really run, and a thrown value reaches the nearest
 * boundary. The admin route module imports `.server` modules, which React
 * Router's plugin refuses in a jsdom (client) transform, so this is also the
 * only way to mount it with its loaders.
 */
async function renderAdminRoute(shellLoader: () => unknown) {
  const routes: RouteObject[] = [
    {
      id: "routes/administracion",
      path: "/administracion",
      loader: shellLoader,
      Component: () => (
        <AdminShellRouteView loaderData={useLoaderData<typeof shellData>()} />
      ),
      ErrorBoundary: () => <ErrorBoundary error={useRouteError()} />,
      children: [
        {
          path: "academias/:academyId",
          loader: () => {
            throw new Response("No encontramos esa Academia.", {
              status: 404,
            });
          },
          Component: () => <h1>Detalle de academia</h1>,
        },
      ],
    },
  ];
  const handler = createStaticHandler(routes);
  const context = await handler.query(
    new Request("http://localhost/administracion/academias/no-existe"),
  );

  if (context instanceof Response) {
    throw new Error("Expected the route to render, not to redirect.");
  }

  return renderToStaticMarkup(
    <StaticRouterProvider
      router={createStaticRouter(handler.dataRoutes, context)}
      context={context}
      hydrate={false}
    />,
  );
}

describe("`/administracion` error boundary", () => {
  test("renders a screen's thrown Response inside the admin shell", async () => {
    const markup = await renderAdminRoute(() => shellData);

    expect(markup).toContain("No encontramos esa Academia.");
    expect(markup).toContain("Página no encontrada");
    expect(markup).toContain("Ada Admin");
    expect(markup).toContain("Saltar al contenido principal");
    expect(markup).toContain('href="/administracion/academias"');
  });

  test("still renders the error when the shell's own loader failed", async () => {
    const markup = await renderAdminRoute(() => {
      throw new Error("Shell loader failed.");
    });

    expect(markup).toContain("Ocurrió un error");
    expect(markup).toContain("Shell loader failed.");
    expect(markup).not.toContain("Saltar al contenido principal");
  });
});

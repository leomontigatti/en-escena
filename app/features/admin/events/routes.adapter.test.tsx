import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

const loadAdministrativeEvents = vi.fn();
const AdministrativeEventsListView = vi.fn(() =>
  createElement("div", null, "Eventos view"),
);

vi.mock("@/features/admin/events/list/server", () => ({
  loadAdministrativeEvents,
}));

vi.mock("@/features/admin/events/list/view", () => ({
  AdministrativeEventsListView,
}));

describe("administracion.eventos route adapter", () => {
  test("delegates loader and render to the admin events list feature module", async () => {
    const routeModule = await import("@/routes/administracion.eventos");
    const request = new Request("http://localhost/administracion/eventos");
    const loaderResult = { events: [] };

    loadAdministrativeEvents.mockResolvedValue(loaderResult);

    await expect(
      routeModule.loader({
        request,
        params: {},
        context: {},
      } as never),
    ).resolves.toBe(loaderResult);

    const markup = renderToStaticMarkup(
      routeModule.AdministracionEventosRouteView({
        loaderData: loaderResult,
      }),
    );

    expect(loadAdministrativeEvents).toHaveBeenCalledWith(request);
    expect(AdministrativeEventsListView).toHaveBeenCalledWith(
      { loaderData: loaderResult },
      undefined,
    );
    expect(markup).toContain("Eventos view");
  });
});

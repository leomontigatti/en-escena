import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

const loadAdministrativeEventPricesList = vi.fn();
const createAdministrativeEventPrice = vi.fn();
const loadAdministrativeEventPriceDetail = vi.fn();
const updateAdministrativeEventPrice = vi.fn();
const AdministrativeEventPricesListView = vi.fn(() =>
  createElement("div", null, "Precios view"),
);
const AdministrativeEventPriceCreateView = vi.fn(() =>
  createElement("div", null, "Nuevo precio view"),
);
const AdministrativeEventPriceDetailView = vi.fn(() =>
  createElement("div", null, "Detalle precio view"),
);
const getAdministrativeEventPriceDisplayName = vi.fn(() => "Precio visible");

const loaderResult = {
  categories: [],
  experienceLevels: [],
  modalities: [],
  prices: [],
  schedules: [],
  selectedEventId: "evento_1",
  submodalities: [],
};

function routeArgs(request: Request, params: Record<string, string> = {}) {
  return {
    context: {},
    params,
    request,
  } as never;
}

vi.mock("@/features/admin/event-prices/list/server", () => ({
  loadAdministrativeEventPricesList,
}));

vi.mock("@/features/admin/event-prices/create/server", () => ({
  createAdministrativeEventPrice,
}));

vi.mock("@/features/admin/event-prices/detail/server", () => ({
  loadAdministrativeEventPriceDetail,
  updateAdministrativeEventPrice,
}));

vi.mock("@/features/admin/event-prices/list/view", () => ({
  AdministrativeEventPricesListView,
}));

vi.mock("@/features/admin/event-prices/create/view", () => ({
  AdministrativeEventPriceCreateView,
}));

vi.mock("@/features/admin/event-prices/detail/view", () => ({
  AdministrativeEventPriceDetailView,
  getAdministrativeEventPriceDisplayName,
}));

describe("administracion.precios route adapters", () => {
  test("delegates loader and render to the admin event prices list feature module", async () => {
    const routeModule = await import("@/routes/administracion.precios");
    const request = new Request("http://localhost/administracion/precios");

    loadAdministrativeEventPricesList.mockResolvedValue(loaderResult);

    await expect(routeModule.loader(routeArgs(request))).resolves.toBe(
      loaderResult,
    );

    const markup = renderToStaticMarkup(
      routeModule.AdministracionPreciosRouteView({
        loaderData: loaderResult,
      }),
    );

    expect(loadAdministrativeEventPricesList).toHaveBeenCalledWith(request);
    expect(AdministrativeEventPricesListView).toHaveBeenCalledWith(
      { loaderData: loaderResult },
      undefined,
    );
    expect(markup).toContain("Precios view");
  });

  test("delegates loader, action and render to the admin event prices create feature module", async () => {
    const routeModule = await import("@/routes/administracion.precios_.nuevo");
    const request = new Request(
      "http://localhost/administracion/precios/nuevo",
      {
        method: "POST",
      },
    );
    const actionResult = {
      fieldErrors: {},
      message: "Revisá los datos del precio.",
      scope: null,
      status: "error" as const,
    };

    loadAdministrativeEventPricesList.mockResolvedValue(loaderResult);
    createAdministrativeEventPrice.mockResolvedValue(actionResult);

    await expect(routeModule.loader(routeArgs(request))).resolves.toBe(
      loaderResult,
    );
    await expect(routeModule.action(routeArgs(request))).resolves.toBe(
      actionResult,
    );

    const markup = renderToStaticMarkup(
      routeModule.AdministracionPrecioNuevoRouteView({
        loaderData: loaderResult,
        actionData: actionResult,
      }),
    );

    expect(loadAdministrativeEventPricesList).toHaveBeenCalledWith(request);
    expect(createAdministrativeEventPrice).toHaveBeenCalledWith(request);
    expect(AdministrativeEventPriceCreateView).toHaveBeenCalledWith(
      { loaderData: loaderResult, actionData: actionResult },
      undefined,
    );
    expect(markup).toContain("Nuevo precio view");
  });

  test("delegates loader, action and render to the admin event prices detail feature module", async () => {
    const routeModule =
      await import("@/routes/administracion.precios_.$priceId");
    const request = new Request(
      "http://localhost/administracion/precios/price_1",
      {
        method: "POST",
      },
    );
    const params = { priceId: "price_1" };
    const actionResult = {
      fieldErrors: {},
      message: "No pudimos guardar.",
      scope: null,
      status: "error" as const,
    };

    loadAdministrativeEventPriceDetail.mockResolvedValue(loaderResult);
    updateAdministrativeEventPrice.mockResolvedValue(actionResult);

    await expect(routeModule.loader(routeArgs(request, params))).resolves.toBe(
      loaderResult,
    );
    await expect(routeModule.action(routeArgs(request, params))).resolves.toBe(
      actionResult,
    );

    const markup = renderToStaticMarkup(
      routeModule.AdministracionPrecioDetalleRouteView({
        loaderData: loaderResult,
        actionData: actionResult,
        priceId: "price_1",
      }),
    );

    expect(loadAdministrativeEventPriceDetail).toHaveBeenCalledWith(request);
    expect(updateAdministrativeEventPrice).toHaveBeenCalledWith(request);
    expect(AdministrativeEventPriceDetailView).toHaveBeenCalledWith(
      {
        loaderData: loaderResult,
        actionData: actionResult,
        priceId: "price_1",
      },
      undefined,
    );
    expect(markup).toContain("Detalle precio view");
  });

  test("reads detail breadcrumb labels from the admin event prices detail feature module", async () => {
    const routeModule =
      await import("@/routes/administracion.precios_.$priceId");
    const breadcrumbResolver = routeModule.handle.adminBreadcrumbs[1];

    expect(typeof breadcrumbResolver).toBe("function");

    const breadcrumb = (
      breadcrumbResolver as (match: {
        data: typeof loaderResult;
        params: { priceId: string };
      }) => { label: string }
    )({
      data: loaderResult,
      params: { priceId: "price_1" },
    });

    expect(getAdministrativeEventPriceDisplayName).toHaveBeenCalledWith(
      undefined,
    );
    expect(breadcrumb).toEqual({ label: "Precio visible" });
  });
});

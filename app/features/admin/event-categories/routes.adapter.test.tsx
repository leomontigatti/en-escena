import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

const loadAdministrativeEventCategoriesList = vi.fn();
const createAdministrativeEventCategory = vi.fn();
const loadAdministrativeEventCategoryDetail = vi.fn();
const updateAdministrativeEventCategory = vi.fn();
const AdministrativeEventCategoriesListView = vi.fn(() =>
  createElement("div", null, "Categorias list view"),
);
const AdministrativeEventCategoryCreateView = vi.fn(() =>
  createElement("div", null, "Categorias create view"),
);
const AdministrativeEventCategoryDetailView = vi.fn(() =>
  createElement("div", null, "Categorias detail view"),
);

vi.mock("@/features/admin/event-categories/list/server", () => ({
  loadAdministrativeEventCategoriesList,
}));

vi.mock("@/features/admin/event-categories/list/view", () => ({
  AdministrativeEventCategoriesListView,
}));

vi.mock("@/features/admin/event-categories/create/server", () => ({
  createAdministrativeEventCategory,
}));

vi.mock("@/features/admin/event-categories/create/view", () => ({
  AdministrativeEventCategoryCreateView,
}));

vi.mock("@/features/admin/event-categories/detail/server", () => ({
  loadAdministrativeEventCategoryDetail,
  updateAdministrativeEventCategory,
}));

vi.mock("@/features/admin/event-categories/detail/view", () => ({
  AdministrativeEventCategoryDetailView,
}));

describe("administracion.categorias route adapters", () => {
  test("delegates loader and render to the admin categorías list feature module", async () => {
    const routeModule = await import("@/routes/administracion.categorias");
    const request = new Request("http://localhost/administracion/categorias");
    const loaderResult = loaderData();

    loadAdministrativeEventCategoriesList.mockResolvedValue(loaderResult);

    await expect(
      routeModule.loader({
        request,
        params: {},
        context: {},
      } as never),
    ).resolves.toBe(loaderResult);

    const markup = renderToStaticMarkup(
      routeModule.AdministracionCategoriasRouteView({
        loaderData: loaderResult,
      }),
    );

    expect(loadAdministrativeEventCategoriesList).toHaveBeenCalledWith(request);
    expect(AdministrativeEventCategoriesListView).toHaveBeenCalledWith(
      { loaderData: loaderResult },
      undefined,
    );
    expect(markup).toContain("Categorias list view");
  });

  test("delegates loader, action, and render to the admin categorías create feature module", async () => {
    const routeModule =
      await import("@/routes/administracion.categorias_.nueva");
    const request = new Request(
      "http://localhost/administracion/categorias/nueva",
      { method: "POST" },
    );
    const loaderResult = loaderData();
    const actionResult = actionData("Revisá los campos.");

    loadAdministrativeEventCategoriesList.mockResolvedValue(loaderResult);
    createAdministrativeEventCategory.mockResolvedValue(actionResult);

    await expect(
      routeModule.loader({
        request,
        params: {},
        context: {},
      } as never),
    ).resolves.toBe(loaderResult);

    await expect(
      routeModule.action({
        request,
        params: {},
        context: {},
      } as never),
    ).resolves.toBe(actionResult);

    const markup = renderRouteView(
      createElement(routeModule.AdministracionCategoriaNuevaRouteView, {
        loaderData: loaderResult,
        actionData: actionResult,
      }),
      "/administracion/categorias/nueva",
    );

    expect(loadAdministrativeEventCategoriesList).toHaveBeenCalledWith(request);
    expect(createAdministrativeEventCategory).toHaveBeenCalledWith(request);
    expect(AdministrativeEventCategoryCreateView).toHaveBeenCalledWith(
      {
        loaderData: loaderResult,
        actionData: actionResult,
      },
      undefined,
    );
    expect(markup).toContain("Categorias create view");
  });

  test("delegates loader, action, and render to the admin categorías detail feature module", async () => {
    const routeModule =
      await import("@/routes/administracion.categorias_.$categoryId");
    const request = new Request(
      "http://localhost/administracion/categorias/categoria_1",
      { method: "POST" },
    );
    const params = { categoryId: "categoria_1" };
    const loaderResult = loaderData({
      categories: [category("categoria_1", "Juvenil")],
    });
    const actionResult = actionData("No pudimos guardar.");

    loadAdministrativeEventCategoryDetail.mockResolvedValue(loaderResult);
    updateAdministrativeEventCategory.mockResolvedValue(actionResult);

    await expect(
      routeModule.loader({
        request,
        params,
        context: {},
      } as never),
    ).resolves.toBe(loaderResult);

    await expect(
      routeModule.action({
        request,
        params,
        context: {},
      } as never),
    ).resolves.toBe(actionResult);

    const markup = renderRouteView(
      createElement(routeModule.AdministracionCategoriaDetalleRouteView, {
        loaderData: loaderResult,
        actionData: actionResult,
        categoryId: "categoria_1",
      }),
      "/administracion/categorias/categoria_1",
    );

    expect(loadAdministrativeEventCategoryDetail).toHaveBeenCalledWith(request);
    expect(updateAdministrativeEventCategory).toHaveBeenCalledWith(request);
    expect(AdministrativeEventCategoryDetailView).toHaveBeenCalledWith(
      {
        loaderData: loaderResult,
        actionData: actionResult,
        categoryId: "categoria_1",
      },
      undefined,
    );
    expect(markup).toContain("Categorias detail view");
  });
});

function renderRouteView(element: ReactElement, url: string) {
  const RoutesStub = createRoutesStub([
    {
      path: "*",
      Component: () => element,
    },
  ]);

  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: [url],
    }),
  );
}

function loaderData(overrides: Record<string, unknown> = {}) {
  return {
    categories: [],
    experienceLevels: [],
    modalities: [],
    prices: [],
    schedules: [],
    selectedEventId: "evento_1",
    submodalities: [],
    ...overrides,
  };
}

function category(id: string, name: string) {
  return {
    createdAt: new Date("2026-01-01T00:00:00Z"),
    eventId: "evento_1",
    experienceLevelIds: [],
    groupTypes: ["solo"],
    id,
    maxAge: 17,
    minAge: 13,
    modalityIds: [],
    name,
  };
}

function actionData(message: string) {
  return {
    fieldErrors: {},
    message,
    scope: null,
    status: "error" as const,
  };
}

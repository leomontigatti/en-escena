import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import type { AdministrativeEventModalitiesLoaderData } from "@/features/admin/event-modalities/shared";

const loadAdministrativeEventModalitiesList = vi.fn();
const AdministrativeEventModalitiesListView = vi.fn(() =>
  createElement("div", null, "Modalidades list view"),
);

const createAdministrativeEventModality = vi.fn();
const AdministrativeEventModalityCreateView = vi.fn(() =>
  createElement("div", null, "Modalidades create view"),
);

const loadAdministrativeEventModalityDetail = vi.fn();
const updateAdministrativeEventModality = vi.fn();
const AdministrativeEventModalityDetailView = vi.fn(() =>
  createElement("div", null, "Modalidades detail view"),
);

vi.mock("@/features/admin/event-modalities/list/server", () => ({
  loadAdministrativeEventModalitiesList,
}));

vi.mock("@/features/admin/event-modalities/list/view", () => ({
  AdministrativeEventModalitiesListView,
}));

vi.mock("@/features/admin/event-modalities/create/server", () => ({
  createAdministrativeEventModality,
}));

vi.mock("@/features/admin/event-modalities/create/view", () => ({
  AdministrativeEventModalityCreateView,
}));

vi.mock("@/features/admin/event-modalities/detail/server", () => ({
  loadAdministrativeEventModalityDetail,
  updateAdministrativeEventModality,
}));

vi.mock("@/features/admin/event-modalities/detail/view", () => ({
  AdministrativeEventModalityDetailView,
}));

describe("administracion.modalidades route adapters", () => {
  test("delegates the list loader and render to the admin event-modalities list feature module", async () => {
    const routeModule = await import("@/routes/administracion.modalidades");
    const request = new Request("http://localhost/administracion/modalidades");
    const loaderResult = loaderData();

    loadAdministrativeEventModalitiesList.mockResolvedValue(loaderResult);

    await expect(
      routeModule.loader({
        request,
        params: {},
        context: {},
      } as never),
    ).resolves.toBe(loaderResult);

    const markup = renderToStaticMarkup(
      routeModule.AdministracionModalidadesRouteView({
        loaderData: loaderResult,
      }),
    );

    expect(loadAdministrativeEventModalitiesList).toHaveBeenCalledWith(request);
    expect(AdministrativeEventModalitiesListView).toHaveBeenCalledWith(
      { loaderData: loaderResult },
      undefined,
    );
    expect(markup).toContain("Modalidades list view");
  });

  test("delegates the create action and render to the admin event-modalities create feature module", async () => {
    const routeModule =
      await import("@/routes/administracion.modalidades_.nueva");
    const request = new Request(
      "http://localhost/administracion/modalidades/nueva",
      { method: "POST" },
    );
    const actionResult = actionData("Revisá los datos.");

    createAdministrativeEventModality.mockResolvedValue(actionResult);

    await expect(
      routeModule.action({
        request,
        params: {},
        context: {},
      } as never),
    ).resolves.toBe(actionResult);

    const markup = renderToStaticMarkup(
      routeModule.AdministracionModalidadNuevaRouteView({
        loaderData: loaderData(),
        actionData: actionResult,
      }),
    );

    expect(createAdministrativeEventModality).toHaveBeenCalledWith(request);
    expect(AdministrativeEventModalityCreateView).toHaveBeenCalledWith(
      {
        actionData: actionResult,
        loaderData: loaderData(),
      },
      undefined,
    );
    expect(markup).toContain("Modalidades create view");
  });

  test("delegates the detail loader, action and render to the admin event-modalities detail feature module", async () => {
    const routeModule =
      await import("@/routes/administracion.modalidades_.$modalityId");
    const request = new Request(
      "http://localhost/administracion/modalidades/mod_1",
      { method: "POST" },
    );
    const loaderRequest = new Request(
      "http://localhost/administracion/modalidades/mod_1",
    );
    const loaderResult = loaderData({
      modalities: [
        {
          createdAt: new Date("2026-01-01T00:00:00Z"),
          eventId: "evento_1",
          id: "mod_1",
          name: "Jazz",
        },
      ],
    });
    const actionResult = actionData("No pudimos guardar.");

    loadAdministrativeEventModalityDetail.mockResolvedValue(loaderResult);
    updateAdministrativeEventModality.mockResolvedValue(actionResult);

    await expect(
      routeModule.loader({
        request: loaderRequest,
        params: { modalityId: "mod_1" },
        context: {},
      } as never),
    ).resolves.toBe(loaderResult);

    await expect(
      routeModule.action({
        request,
        params: { modalityId: "mod_1" },
        context: {},
      } as never),
    ).resolves.toBe(actionResult);

    const markup = renderToStaticMarkup(
      routeModule.AdministracionModalidadDetalleRouteView({
        actionData: actionResult,
        loaderData: loaderResult,
        modalityId: "mod_1",
      }),
    );

    expect(loadAdministrativeEventModalityDetail).toHaveBeenCalledWith(
      loaderRequest,
      "mod_1",
    );
    expect(updateAdministrativeEventModality).toHaveBeenCalledWith(
      request,
      "mod_1",
    );
    expect(AdministrativeEventModalityDetailView).toHaveBeenCalledWith(
      {
        actionData: actionResult,
        loaderData: loaderResult,
        modalityId: "mod_1",
      },
      undefined,
    );
    expect(markup).toContain("Modalidades detail view");
  });
});

function loaderData(
  overrides: Partial<AdministrativeEventModalitiesLoaderData> = {},
): AdministrativeEventModalitiesLoaderData {
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

function actionData(message: string) {
  return {
    fieldErrors: {},
    message,
    scope: null,
    status: "error" as const,
  };
}

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

const loadAdministrativeEventSchedulesList = vi.fn();
const createAdministrativeEventSchedule = vi.fn();
const loadAdministrativeEventScheduleDetail = vi.fn();
const updateAdministrativeEventSchedule = vi.fn();
const AdministrativeEventSchedulesListView = vi.fn(() =>
  createElement("div", null, "Cronogramas view"),
);
const AdministrativeEventScheduleCreateView = vi.fn(() =>
  createElement("div", null, "Nuevo cronograma view"),
);
const AdministrativeEventScheduleDetailView = vi.fn(() =>
  createElement("div", null, "Detalle cronograma view"),
);

vi.mock("@/features/admin/event-schedules/list/server", () => ({
  loadAdministrativeEventSchedulesList,
}));

vi.mock("@/features/admin/event-schedules/create/server", () => ({
  createAdministrativeEventSchedule,
}));

vi.mock("@/features/admin/event-schedules/detail/server", () => ({
  loadAdministrativeEventScheduleDetail,
  updateAdministrativeEventSchedule,
}));

vi.mock("@/features/admin/event-schedules/list/view", () => ({
  AdministrativeEventSchedulesListView,
}));

vi.mock("@/features/admin/event-schedules/create/view", () => ({
  AdministrativeEventScheduleCreateView,
}));

vi.mock("@/features/admin/event-schedules/detail/view", () => ({
  AdministrativeEventScheduleDetailView,
}));

describe("administracion.cronogramas route adapters", () => {
  test("delegates loader and render to the admin event schedules list feature module", async () => {
    const routeModule = await import("@/routes/administracion.cronogramas");
    const request = new Request("http://localhost/administracion/cronogramas");
    const loaderResult = {
      categories: [],
      experienceLevels: [],
      modalities: [],
      prices: [],
      schedules: [],
      selectedEventId: "evento_1",
      submodalities: [],
    };

    loadAdministrativeEventSchedulesList.mockResolvedValue(loaderResult);

    await expect(
      routeModule.loader({
        request,
        params: {},
        context: {},
      } as never),
    ).resolves.toBe(loaderResult);

    const markup = renderToStaticMarkup(
      routeModule.AdministracionCronogramasRouteView({
        loaderData: loaderResult,
      }),
    );

    expect(loadAdministrativeEventSchedulesList).toHaveBeenCalledWith(request);
    expect(AdministrativeEventSchedulesListView).toHaveBeenCalledWith(
      { loaderData: loaderResult },
      undefined,
    );
    expect(markup).toContain("Cronogramas view");
  });

  test("delegates loader, action and render to the admin event schedules create feature module", async () => {
    const routeModule =
      await import("@/routes/administracion.cronogramas_.nuevo");
    const request = new Request(
      "http://localhost/administracion/cronogramas/nuevo",
      {
        method: "POST",
      },
    );
    const loaderResult = {
      categories: [],
      experienceLevels: [],
      modalities: [],
      prices: [],
      schedules: [],
      selectedEventId: "evento_1",
      submodalities: [],
    };
    const actionResult = {
      fieldErrors: {},
      message: "Revisá los datos del cronograma.",
      scope: null,
      status: "error" as const,
    };

    loadAdministrativeEventSchedulesList.mockResolvedValue(loaderResult);
    createAdministrativeEventSchedule.mockResolvedValue(actionResult);

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

    const markup = renderToStaticMarkup(
      routeModule.AdministracionCronogramaNuevoRouteView({
        loaderData: loaderResult,
        actionData: actionResult,
      }),
    );

    expect(loadAdministrativeEventSchedulesList).toHaveBeenCalledWith(request);
    expect(createAdministrativeEventSchedule).toHaveBeenCalledWith(request);
    expect(AdministrativeEventScheduleCreateView).toHaveBeenCalledWith(
      { loaderData: loaderResult, actionData: actionResult },
      undefined,
    );
    expect(markup).toContain("Nuevo cronograma view");
  });

  test("delegates loader, action and render to the admin event schedules detail feature module", async () => {
    const routeModule =
      await import("@/routes/administracion.cronogramas_.$scheduleId");
    const request = new Request(
      "http://localhost/administracion/cronogramas/schedule_1",
      {
        method: "POST",
      },
    );
    const loaderResult = {
      categories: [],
      experienceLevels: [],
      modalities: [],
      prices: [],
      schedules: [],
      selectedEventId: "evento_1",
      submodalities: [],
    };
    const actionResult = {
      fieldErrors: {},
      message: "No pudimos guardar.",
      scope: null,
      status: "error" as const,
    };

    loadAdministrativeEventScheduleDetail.mockResolvedValue(loaderResult);
    updateAdministrativeEventSchedule.mockResolvedValue(actionResult);

    await expect(
      routeModule.loader({
        request,
        params: { scheduleId: "schedule_1" },
        context: {},
      } as never),
    ).resolves.toBe(loaderResult);
    await expect(
      routeModule.action({
        request,
        params: { scheduleId: "schedule_1" },
        context: {},
      } as never),
    ).resolves.toBe(actionResult);

    const markup = renderToStaticMarkup(
      routeModule.AdministracionCronogramaDetalleRouteView({
        loaderData: loaderResult,
        actionData: actionResult,
        scheduleId: "schedule_1",
      }),
    );

    expect(loadAdministrativeEventScheduleDetail).toHaveBeenCalledWith(request);
    expect(updateAdministrativeEventSchedule).toHaveBeenCalledWith(request);
    expect(AdministrativeEventScheduleDetailView).toHaveBeenCalledWith(
      {
        loaderData: loaderResult,
        actionData: actionResult,
        scheduleId: "schedule_1",
      },
      undefined,
    );
    expect(markup).toContain("Detalle cronograma view");
  });
});

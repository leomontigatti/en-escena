import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

const loadEventSchedulesList = vi.fn();
const createAdministrativeEventSchedule = vi.fn();
const loadEventScheduleCreate = vi.fn();
const loadEventScheduleDetail = vi.fn();
const updateAdministrativeEventSchedule = vi.fn();
const EventSchedulesListView = vi.fn(() =>
  createElement("div", null, "Cronogramas view"),
);
const EventScheduleCreateView = vi.fn(() =>
  createElement("div", null, "Nuevo cronograma view"),
);
const EventScheduleDetailView = vi.fn(() =>
  createElement("div", null, "Detalle cronograma view"),
);

const loaderResult = {
  modalities: [],
  schedules: [],
  selectedEventId: "evento_1",
};

function routeArgs(request: Request, params: Record<string, string> = {}) {
  return {
    context: {},
    params,
    request,
  } as never;
}

vi.mock("@/features/admin/schedules/list/server", () => ({
  loadEventSchedulesList,
}));

vi.mock("@/features/admin/schedules/create/server", () => ({
  createAdministrativeEventSchedule,
  loadEventScheduleCreate,
}));

vi.mock("@/features/admin/schedules/detail/server", () => ({
  loadEventScheduleDetail,
  updateAdministrativeEventSchedule,
}));

vi.mock("@/features/admin/schedules/list/view", () => ({
  EventSchedulesListView,
}));

vi.mock("@/features/admin/schedules/create/view", () => ({
  EventScheduleCreateView,
}));

vi.mock("@/features/admin/schedules/detail/view", () => ({
  EventScheduleDetailView,
}));

describe("`administracion.cronogramas` route adapters", () => {
  test("delegates loader and render to the admin event schedules list feature module", async () => {
    const routeModule = await import("@/routes/administracion.cronogramas");
    const request = new Request("http://localhost/administracion/cronogramas");

    loadEventSchedulesList.mockResolvedValue(loaderResult);

    await expect(routeModule.loader(routeArgs(request))).resolves.toBe(
      loaderResult,
    );

    const markup = renderToStaticMarkup(
      routeModule.EventSchedulesListRouteView({
        loaderData: loaderResult,
      }),
    );

    expect(loadEventSchedulesList).toHaveBeenCalledWith(request);
    expect(EventSchedulesListView).toHaveBeenCalledWith(
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
    const actionResult = {
      fieldErrors: {},
      message: "Revisá los datos del cronograma.",
      scope: null,
      status: "error" as const,
    };

    loadEventScheduleCreate.mockResolvedValue(loaderResult);
    createAdministrativeEventSchedule.mockResolvedValue(actionResult);

    await expect(routeModule.loader(routeArgs(request))).resolves.toBe(
      loaderResult,
    );
    await expect(routeModule.action(routeArgs(request))).resolves.toBe(
      actionResult,
    );

    const markup = renderToStaticMarkup(
      routeModule.NewEventScheduleRouteView({
        loaderData: loaderResult,
        actionData: actionResult,
      }),
    );

    expect(loadEventScheduleCreate).toHaveBeenCalledWith(request);
    expect(createAdministrativeEventSchedule).toHaveBeenCalledWith(request);
    expect(EventScheduleCreateView).toHaveBeenCalledWith(
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
    const params = { scheduleId: "schedule_1" };
    const actionResult = {
      fieldErrors: {},
      message: "No pudimos guardar.",
      scope: null,
      status: "error" as const,
    };

    loadEventScheduleDetail.mockResolvedValue(loaderResult);
    updateAdministrativeEventSchedule.mockResolvedValue(actionResult);

    await expect(routeModule.loader(routeArgs(request, params))).resolves.toBe(
      loaderResult,
    );
    await expect(routeModule.action(routeArgs(request, params))).resolves.toBe(
      actionResult,
    );

    const markup = renderToStaticMarkup(
      routeModule.EventScheduleDetailRouteView({
        loaderData: loaderResult,
        actionData: actionResult,
        scheduleId: "schedule_1",
      }),
    );

    expect(loadEventScheduleDetail).toHaveBeenCalledWith(request);
    expect(updateAdministrativeEventSchedule).toHaveBeenCalledWith(request);
    expect(EventScheduleDetailView).toHaveBeenCalledWith(
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

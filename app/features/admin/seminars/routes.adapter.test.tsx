import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

const loadSeminarsList = vi.fn();
const loadSeminarCreate = vi.fn();
const createAdministrativeSeminar = vi.fn();
const loadSeminarDetail = vi.fn();
const updateAdministrativeSeminar = vi.fn();
const SeminarsListView = vi.fn(() =>
  createElement("div", null, "Seminarios view"),
);
const SeminarCreateView = vi.fn(() =>
  createElement("div", null, "Nuevo seminario view"),
);
const SeminarDetailView = vi.fn(() =>
  createElement("div", null, "Detalle seminario view"),
);

const seminarFormValues = {
  instructorName: "Abril Sosa",
  scheduledDate: "2026-10-10",
  startTime: "18:30",
  quota: "20",
  kind: "regular" as const,
  requiredDepositPercentage: "50",
  instructorPictureKept: "" as const,
};

const listLoaderResult = {
  selectedEventId: "evento_1",
  seminars: [],
};

const createLoaderResult = {
  selectedEventId: "evento_1",
  values: seminarFormValues,
};

const detailLoaderResult = {
  hasCoveredInscription: false,
  inscriptions: [],
  instructorPictureUrl: null,
  selectedEventId: "evento_1",
  seminar: {
    id: "seminar_1",
    eventId: "evento_1",
    instructorName: "Abril Sosa",
    instructorPictureStorageKey: null,
    scheduledDate: "2026-10-10",
    startTime: "18:30",
    quota: 20,
    kind: "regular" as const,
    requiredDepositPercentage: 50,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    availablePlaces: 20,
    registeredCount: 0,
    inscriptionCount: 0,
  },
  values: seminarFormValues,
};

function routeArgs(request: Request, params: Record<string, string> = {}) {
  return {
    context: {},
    params,
    request,
  } as never;
}

vi.mock("@/features/admin/seminars/list/server", () => ({
  loadSeminarsList,
}));

vi.mock("@/features/admin/seminars/create/server", () => ({
  createAdministrativeSeminar,
  loadSeminarCreate,
}));

vi.mock("@/features/admin/seminars/detail/server", () => ({
  loadSeminarDetail,
  updateAdministrativeSeminar,
}));

vi.mock("@/features/admin/seminars/list/view", () => ({
  SeminarsListView,
}));

vi.mock("@/features/admin/seminars/create/view", () => ({
  SeminarCreateView,
}));

vi.mock("@/features/admin/seminars/detail/view", () => ({
  SeminarDetailView,
}));

describe("`administracion.seminarios` route adapters", () => {
  test("delegates loader and render to the admin seminars list feature module", async () => {
    const routeModule = await import("@/routes/administracion.seminarios");
    const request = new Request("http://localhost/administracion/seminarios");

    loadSeminarsList.mockResolvedValue(listLoaderResult);

    await expect(routeModule.loader(routeArgs(request))).resolves.toBe(
      listLoaderResult,
    );

    const markup = renderToStaticMarkup(
      routeModule.SeminarsListRouteView({ loaderData: listLoaderResult }),
    );

    expect(loadSeminarsList).toHaveBeenCalledWith(request);
    expect(markup).toContain("Seminarios view");
  });

  test("delegates loader, action and render to the admin seminars create feature module", async () => {
    const routeModule =
      await import("@/routes/administracion.seminarios_.nuevo");
    const request = new Request(
      "http://localhost/administracion/seminarios/nuevo",
      { method: "POST" },
    );
    const actionResult = {
      fieldErrors: {},
      intent: "create-seminar",
      message: "Revisá los datos del seminario.",
      status: "error" as const,
    };

    loadSeminarCreate.mockResolvedValue(createLoaderResult);
    createAdministrativeSeminar.mockResolvedValue(actionResult);

    await expect(routeModule.loader(routeArgs(request))).resolves.toBe(
      createLoaderResult,
    );
    await expect(routeModule.action(routeArgs(request))).resolves.toBe(
      actionResult,
    );

    const markup = renderToStaticMarkup(
      routeModule.NewSeminarRouteView({
        loaderData: createLoaderResult,
        actionData: actionResult,
      }),
    );

    expect(loadSeminarCreate).toHaveBeenCalledWith(request);
    expect(createAdministrativeSeminar).toHaveBeenCalledWith(request);
    expect(markup).toContain("Nuevo seminario view");
  });

  test("delegates loader, action and render to the admin seminars detail feature module", async () => {
    const routeModule =
      await import("@/routes/administracion.seminarios_.$seminarId");
    const request = new Request(
      "http://localhost/administracion/seminarios/seminar_1",
      { method: "POST" },
    );
    const params = { seminarId: "seminar_1" };
    const actionResult = {
      intent: "update-seminar",
      message: "Seminario guardado.",
      status: "success" as const,
    };

    loadSeminarDetail.mockResolvedValue(detailLoaderResult);
    updateAdministrativeSeminar.mockResolvedValue(actionResult);

    await expect(routeModule.loader(routeArgs(request, params))).resolves.toBe(
      detailLoaderResult,
    );
    await expect(routeModule.action(routeArgs(request, params))).resolves.toBe(
      actionResult,
    );

    const markup = renderToStaticMarkup(
      routeModule.SeminarDetailRouteView({
        loaderData: detailLoaderResult,
        actionData: actionResult,
      }),
    );

    expect(loadSeminarDetail).toHaveBeenCalledWith(request, "seminar_1");
    expect(updateAdministrativeSeminar).toHaveBeenCalledWith(
      request,
      "seminar_1",
    );
    expect(markup).toContain("Detalle seminario view");
  });
});

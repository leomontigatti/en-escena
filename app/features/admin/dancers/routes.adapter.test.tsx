import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

const loadAdminDancersList = vi.fn();
const loadAdminDancerDetail = vi.fn();
const handleAdminDancerDetailAction = vi.fn();
const AdministracionBailarinesRouteView = vi.fn(() =>
  createElement("div", null, "Bailarines view"),
);
const AdministracionBailarinDetalleRouteView = vi.fn(() =>
  createElement("div", null, "Detalle Bailarin view"),
);

vi.mock("@/features/admin/dancers/list/server", () => ({
  loadAdminDancersList,
}));

vi.mock("@/features/admin/dancers/list/view", () => ({
  AdministracionBailarinesRouteView,
}));

vi.mock("@/features/admin/dancers/detail/server", () => ({
  handleAdminDancerDetailAction,
  loadAdminDancerDetail,
}));

vi.mock("@/features/admin/dancers/detail/view", () => ({
  AdministracionBailarinDetalleRouteView,
  InscriptionsSection: vi.fn(),
}));

describe("administracion.bailarines route adapters", () => {
  test("delegates list loader and render to the admin Bailarines list feature module", async () => {
    const routeModule = await import("@/routes/administracion.bailarines");
    const request = new Request("http://localhost/administracion/bailarines");
    const loaderResult = {
      selectedEventId: null,
      filters: {
        identification: "all" as const,
        nameOrder: "asc" as const,
        page: 1,
        participation: "all" as const,
        query: "",
        status: "active" as const,
      },
      hasAnyDancer: false,
      dancers: [],
      totalCount: 0,
      totalPages: 1,
    };

    loadAdminDancersList.mockResolvedValue(loaderResult);

    await expect(
      routeModule.loader({
        request,
        params: {},
        context: {},
      } as never),
    ).resolves.toBe(loaderResult);

    const markup = renderToStaticMarkup(
      routeModule.AdministracionBailarinesRouteView({
        loaderData: loaderResult,
      }),
    );

    expect(loadAdminDancersList).toHaveBeenCalledWith(request);
    expect(AdministracionBailarinesRouteView).toHaveBeenCalledWith({
      loaderData: loaderResult,
    });
    expect(markup).toContain("Bailarines view");
  });

  test("delegates detail loader, action, and render to the admin Bailarín detail feature module", async () => {
    const routeModule =
      await import("@/routes/administracion.bailarines_.$dancerId");
    const request = new Request(
      "http://localhost/administracion/bailarines/dancer-1",
      {
        method: "POST",
      },
    );
    const params = { dancerId: "dancer-1" };
    const loaderResult = {
      backToList: "/administracion/bailarines",
      cancelHref: "/administracion/bailarines/dancer-1",
      canEdit: true,
      dancer: {
        academy: {
          contactName: "Contacto Test",
          email: "academia@example.com",
          id: "academy-1",
          name: "Academia Test",
          phone: "1234-5678",
        },
        active: true,
        birthDate: "2012-07-12",
        choreographyNames: [],
        editConsequence: null,
        createdAt: new Date("2026-01-10T12:00:00.000Z"),
        documentBackImageStorageKey: "document-back",
        documentFrontImageStorageKey: "document-front",
        documentNumber: "12345678",
        documentType: "dni" as const,
        firstName: "Julia",
        id: "dancer-1",
        identificationStatus: "unverified" as const,
        identityVerifiedAt: null,
        inscriptions: [],
        lastName: "Diaz",
        participatedInAnyEvent: false,
        participationStatus: "not-participating" as const,
        updatedAt: new Date("2026-01-10T12:00:00.000Z"),
      },
      documentImageUrls: {
        back: null,
        front: null,
      },
      editHref: "/administracion/bailarines/dancer-1?modo=editar",
      isEditing: false,
      selectedEventId: null,
    };
    const actionResult = {
      fieldErrors: {},
      message: "Revisá los campos marcados.",
      status: "error" as const,
      values: {
        birthDate: "2000-01-01",
        documentBackImageStorageKey: "document-back",
        documentFrontImageStorageKey: "document-front",
        documentNumber: "12345678",
        documentType: "dni",
        firstName: "Julia",
        lastName: "Diaz",
      },
    };

    loadAdminDancerDetail.mockResolvedValue(loaderResult);
    handleAdminDancerDetailAction.mockResolvedValue(actionResult);

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

    const markup = renderToStaticMarkup(
      routeModule.AdministracionBailarinDetalleRouteView({
        actionData: actionResult,
        loaderData: loaderResult,
      }),
    );

    expect(loadAdminDancerDetail).toHaveBeenCalledWith({
      params,
      request,
    });
    expect(handleAdminDancerDetailAction).toHaveBeenCalledWith({
      params,
      request,
    });
    expect(AdministracionBailarinDetalleRouteView).toHaveBeenCalledWith(
      {
        actionData: actionResult,
        loaderData: loaderResult,
      },
      undefined,
    );
    expect(markup).toContain("Detalle Bailarin view");
  });
});

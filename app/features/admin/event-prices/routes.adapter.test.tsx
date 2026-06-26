import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";

import type {
  AdministrativeEventPriceActionData,
  AdministrativeEventPricesLoaderData,
} from "@/features/admin/event-prices/shared";
import {
  AdministracionPrecioDetalleRouteView,
  handle as detailRouteHandle,
} from "@/routes/administracion.precios_.$priceId";
import { AdministracionPrecioNuevoRouteView } from "@/routes/administracion.precios_.nuevo";
import { AdministracionPreciosRouteView } from "@/routes/administracion.precios";
import type { AdministrativeEventPriceDetailViewProps } from "./detail/view";

describe("administracion.precios route adapters", () => {
  test("renders the list feature view from the list route adapter", () => {
    const markup = renderRouteView(
      createElement(AdministracionPreciosRouteView, {
        loaderData: loaderData({
          prices: [price("precio_1", "Precio Solo")],
        }),
      }),
      "/administracion/precios",
    );

    expect(markup).toContain("Precios");
    expect(markup).toContain("Nuevo precio");
    expect(markup).toContain("Precio Solo");
    expect(markup).toContain("Solo");
    expect(markup).toContain("$12000");
  });

  test("renders the create feature view from the create route adapter", () => {
    const markup = renderRouteView(
      createElement(AdministracionPrecioNuevoRouteView, {
        loaderData: loaderData(),
        actionData: actionData("Revisá los datos del precio."),
      }),
      "/administracion/precios/nuevo",
    );

    expect(markup).toContain("Nuevo precio");
    expect(markup).toContain("Configurá tipo de grupo");
    expect(markup).toContain("Volver");
    expect(markup).toContain("Guardar");
  });

  test("renders the detail feature view from the detail route adapter", () => {
    const markup = renderRouteView(
      createElement(AdministracionPrecioDetalleRouteView, {
        loaderData: loaderData({
          prices: [price("precio_1", "Precio Solo")],
        }),
        actionData: actionData("No pudimos guardar."),
        priceId: "precio_1",
      }),
      "/administracion/precios/precio_1",
    );

    expect(markup).toContain("Editar precio");
    expect(markup).toContain("Precio Solo");
    expect(markup).toContain("Tipo de grupo");
    expect(markup).toContain("Acciones");
    expect(markup).toContain("Guardar");
  });

  test("renders the not-found detail state from the detail route adapter", () => {
    const markup = renderRouteView(
      createElement(AdministracionPrecioDetalleRouteView, {
        loaderData: loaderData(),
        priceId: "precio_inexistente",
      }),
      "/administracion/precios/precio_inexistente",
    );

    expect(markup).toContain("Precio no encontrado");
    expect(markup).toContain("No encontramos ese precio.");
  });

  test("reads detail breadcrumb labels from the price display name helper", () => {
    const breadcrumb = resolveDetailBreadcrumb({
      loaderData: loaderData({
        prices: [price("precio_1", "Precio Solo")],
      }),
      priceId: "precio_1",
    });

    expect(breadcrumb).toEqual({ label: "Precio Solo" });
  });

  test("uses a fallback detail breadcrumb when the price is missing", () => {
    const breadcrumb = resolveDetailBreadcrumb({
      loaderData: loaderData(),
      priceId: "precio_inexistente",
    });

    expect(breadcrumb).toEqual({ label: "Precio" });
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

function resolveDetailBreadcrumb({
  loaderData,
  priceId,
}: {
  loaderData: AdministrativeEventPriceDetailViewProps["loaderData"];
  priceId: string;
}) {
  const breadcrumbResolver = detailRouteHandle.adminBreadcrumbs[1];

  if (typeof breadcrumbResolver !== "function") {
    throw new Error("Expected the detail breadcrumb to be resolved from data.");
  }

  return breadcrumbResolver({
    data: loaderData,
    params: { priceId },
  });
}

function price(id: string, name: string) {
  return {
    amount: 12000,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    eventId: "evento_1",
    groupType: "solo" as const,
    id,
    name,
    paymentDeadline: "2026-05-31",
    schedule: null,
    scheduleId: null,
  };
}

function loaderData(
  overrides: Partial<AdministrativeEventPricesLoaderData> = {},
): AdministrativeEventPricesLoaderData {
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

function actionData(message: string): AdministrativeEventPriceActionData {
  return {
    fieldErrors: {},
    message,
    scope: null,
    status: "error",
  };
}

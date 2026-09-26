import { describe, expect, test } from "vitest";

import type { EventPricesLoaderData } from "@/features/admin/prices/shared";
import { handle as detailRouteHandle } from "@/routes/administracion.precios_.$priceId";
import type { EventPriceDetailViewProps } from "./detail/view";

describe("`administracion.precios` route adapters", () => {
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

function resolveDetailBreadcrumb({
  loaderData,
  priceId,
}: {
  loaderData: EventPriceDetailViewProps["loaderData"];
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
    isReferenced: false,
    keepsRegistrationOpen: false,
    schedule: null,
    scheduleId: null,
  };
}

function loaderData(
  overrides: Partial<EventPricesLoaderData> = {},
): EventPricesLoaderData {
  return {
    prices: [],
    schedules: [],
    seminarPrices: [],
    hasSeminars: false,
    selectedEventId: "evento_1",
    ...overrides,
  };
}

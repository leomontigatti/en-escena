import { createElement } from "react";
import { describe, expect, test } from "vitest";

import { renderRouteView } from "@/features/admin/test-support/render-route-view";
import type { SeminarPricesListLoaderData } from "@/features/admin/seminar-prices/shared";
import { SeminarPriceDetailRouteView } from "@/routes/administracion.precios_.seminarios_.$seminarPriceId";
import { NewSeminarPriceRouteView } from "@/routes/administracion.precios_.seminarios_.nuevo";

function loaderData(
  overrides: Partial<SeminarPricesListLoaderData> = {},
): SeminarPricesListLoaderData {
  return {
    selectedEventId: "evento_1",
    seminarPrices: [],
    ...overrides,
  };
}

describe("`administracion.precios/seminarios` route adapters", () => {
  test("renders the create feature view from the new-price route adapter", () => {
    const markup = renderRouteView(
      createElement(NewSeminarPriceRouteView, { loaderData: loaderData() }),
      "/administracion/precios/seminarios/nuevo",
    );

    expect(markup).toContain("Nuevo precio de seminario");
    expect(markup).toContain('name="kind"');
    expect(markup).toContain("Para participantes");
  });

  test("renders the detail feature view from the detail route adapter", () => {
    const markup = renderRouteView(
      createElement(SeminarPriceDetailRouteView, {
        loaderData: loaderData({
          seminarPrices: [
            {
              id: "seminar_price_1",
              eventId: "evento_1",
              name: "Precio participantes",
              kind: "regular",
              forParticipants: true,
              paymentDeadline: null,
              amount: 20000,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              isReferenced: false,
              keepsRegistrationOpen: false,
            },
          ],
        }),
        seminarPriceId: "seminar_price_1",
      }),
      "/administracion/precios/seminarios/seminar_price_1",
    );

    expect(markup).toContain("Editar precio de seminario");
    expect(markup).toContain("Precio participantes");
  });

  test("reports a missing row instead of an empty form", () => {
    const markup = renderRouteView(
      createElement(SeminarPriceDetailRouteView, {
        loaderData: loaderData(),
        seminarPriceId: "seminar_price_missing",
      }),
      "/administracion/precios/seminarios/seminar_price_missing",
    );

    expect(markup).toContain("Precio no encontrado");
  });
});

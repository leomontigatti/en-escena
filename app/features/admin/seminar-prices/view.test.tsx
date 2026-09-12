import { createElement } from "react";
import { describe, expect, test } from "vitest";

import { renderRouteView } from "@/features/admin/test-support/render-route-view";
import { EventPricesListView } from "@/features/admin/prices/list/view";
import { SeminarPriceDetailView } from "@/features/admin/seminar-prices/detail/view";
import { seminarPriceFacetedFilterIds } from "@/features/admin/seminar-prices/list-table";
import { readSeminarPriceDeletionBlock } from "@/features/admin/seminar-prices/view-shared";
import type { SeminarPriceListItem } from "@/lib/seminar-prices/repository.server";

function seminarPrice(
  overrides: Partial<SeminarPriceListItem> = {},
): SeminarPriceListItem {
  return {
    id: "seminar_price_1",
    eventId: "event_1",
    name: "Precio participantes",
    kind: "regular",
    forParticipants: true,
    paymentDeadline: null,
    amount: 20000,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    isReferenced: false,
    keepsRegistrationOpen: false,
    ...overrides,
  };
}

function renderList(seminarPrices: SeminarPriceListItem[], url: string) {
  return renderRouteView(
    createElement(EventPricesListView, {
      loaderData: {
        selectedEventId: "event_1",
        prices: [],
        seminarPrices,
      },
    }),
    url,
  );
}

function renderDetail(item: SeminarPriceListItem) {
  return renderRouteView(
    createElement(SeminarPriceDetailView, {
      loaderData: {
        selectedEventId: "event_1",
        seminarPrices: [item],
      },
      seminarPriceId: item.id,
    }),
    `/administracion/precios/seminarios/${item.id}`,
  );
}

describe("`Precios` with its seminar tab", () => {
  test("offers both tabs and points `Nuevo precio` at the tab being read", () => {
    const choreographyTab = renderList([], "/administracion/precios");

    expect(choreographyTab).toContain("Coreografías");
    expect(choreographyTab).toContain("Seminarios");
    expect(choreographyTab).toContain('href="/administracion/precios/nuevo"');

    const seminarTab = renderList(
      [],
      "/administracion/precios?lista=seminarios",
    );

    expect(seminarTab).toContain(
      'href="/administracion/precios/seminarios/nuevo"',
    );
  });

  test("reads a seminar price by its name, its kind and its participant cell", () => {
    const markup = renderList(
      [
        seminarPrice({
          name: "Precio exclusivo",
          kind: "special",
          forParticipants: false,
          paymentDeadline: "2026-06-30",
          amount: 31000,
        }),
        seminarPrice({ id: "seminar_price_2" }),
      ],
      "/administracion/precios?lista=seminarios",
    );

    expect(markup).toContain("Precio exclusivo");
    expect(markup).toContain("Exclusivo");
    expect(markup).toContain("No participante");
    expect(markup).toContain(
      'href="/administracion/precios/seminarios/seminar_price_1"',
    );
    expect(markup).toContain("Tipo de seminario");
    // The facets live in a popover the static render never opens, so the table
    // is asked for the two axes it filters by instead.
    expect(seminarPriceFacetedFilterIds).toEqual([
      "tipo-de-seminario",
      "participantes",
    ]);
  });

  test("warns about the participant cell whose deadline-less `Común` row is missing", () => {
    const markup = renderList(
      [seminarPrice()],
      "/administracion/precios?lista=seminarios",
    );

    expect(markup).toContain("no participantes");
    expect(markup).not.toContain("para participantes y no participantes");

    const covered = renderList(
      [
        seminarPrice(),
        seminarPrice({ id: "seminar_price_2", forParticipants: false }),
      ],
      "/administracion/precios?lista=seminarios",
    );

    expect(covered).not.toContain("Falta el precio");
  });
});

describe("seminar price detail", () => {
  test("edits every field of an unguarded row", () => {
    const markup = renderDetail(
      seminarPrice({ paymentDeadline: "2026-06-30" }),
    );

    expect(markup).toContain('name="amount"');
    expect(markup).toContain('name="kind"');
    expect(markup).not.toContain("congelaron este precio");
    expect(readSeminarPriceDeletionBlock(seminarPrice())).toBeNull();
  });

  test("locks a referenced row down to its name and explains why", () => {
    const markup = renderDetail(
      seminarPrice({ paymentDeadline: "2026-06-30", isReferenced: true }),
    );

    expect(markup).toContain(
      "Hay inscripciones que congelaron este precio, así que solo podés cambiarle el nombre.",
    );
    // Every guarded field reads through the shared read-only look, so none of
    // them is an editable control any more.
    expect(markup).not.toContain('name="kind"><');
    // `Borrar precio` is disabled on sight, and its dialog opens blocked,
    // rather than refusing after the submission.
    expect(
      readSeminarPriceDeletionBlock(seminarPrice({ isReferenced: true })),
    ).toContain("no se puede borrar");
  });

  test("keeps the amount of the row that holds the event's seminars open", () => {
    const markup = renderDetail(seminarPrice({ keepsRegistrationOpen: true }));

    expect(markup).toContain("Podés cambiarle el monto.");
    expect(markup).toContain('name="amount"');
    expect(
      readSeminarPriceDeletionBlock(
        seminarPrice({ keepsRegistrationOpen: true }),
      ),
    ).toContain("No se puede borrar el precio");
  });
});

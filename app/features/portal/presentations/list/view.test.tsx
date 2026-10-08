import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { PortalPresentationsListView } from "./view";
import type {
  PortalPresentationRow,
  PortalPresentationsLoaderData,
} from "./server";
import { renderInDataRouter } from "@/lib/test-support/data-router";

describe("PortalPresentationsListView", () => {
  test("shows the empty state when there is no active event", () => {
    const markup = renderView({
      hasActiveEvent: false,
      hasPublishedPresentations: false,
      rows: [],
    });

    expect(markup).toContain("No hay un evento activo");
    expect(markup).toContain(
      "Cuando la organización active un evento vas a ver acá las presentaciones de tu academia.",
    );
  });

  test("shows the empty state while no published day has a presentation", () => {
    const markup = renderView({ hasPublishedPresentations: false });

    expect(markup).toContain("Todavía no hay orden de presentaciones");
    expect(markup).toContain(
      "Cuando la organización publique el programa vas a ver acá el número de cada coreografía.",
    );
  });

  test("shows the empty state when the academy has nothing in the order", () => {
    const markup = renderView({ rows: [] });

    expect(markup).toContain("Tu academia no tiene presentaciones");
    expect(markup).toContain(
      "Cuando tu academia inscriba una coreografía en el evento activo, va a aparecer acá.",
    );
  });

  test("links to the full program once any day of it is published", () => {
    expect(renderView({ hasVisibleDay: true })).toContain(
      "Ver programa completo",
    );
    expect(renderView({ hasVisibleDay: false })).not.toContain(
      "Ver programa completo",
    );
  });

  test("counts the choreographies that still owe their deposit and links to the finances", () => {
    const singular = renderView({
      rows: [buildRow({ isBelowDeposit: true })],
    });

    expect(singular).toContain("Existe 1 coreografía con la seña pendiente.");
    expect(singular).toContain("Ver finanzas");
    expect(singular).toContain("/portal/finanzas");

    const plural = renderView({
      rows: [
        buildRow({ choreographyId: "one", isBelowDeposit: true }),
        buildRow({ choreographyId: "two", isBelowDeposit: true }),
      ],
    });

    expect(plural).toContain("Existen 2 coreografías con la seña pendiente.");

    expect(renderView({ rows: [buildRow()] })).not.toContain(
      "con la seña pendiente",
    );
  });

  // The deposit is told by the notice above the list, and a missing number by
  // its empty cell: the list itself carries no state.
  test("carries no state column", () => {
    const markup = renderView({
      rows: [
        buildRow({
          choreographyId: "late",
          isBelowDeposit: true,
          orderNumber: null,
        }),
        buildRow({ choreographyId: "numbered", orderNumber: 3 }),
      ],
    });

    expect(markup).not.toContain("Estado");
    expect(markup).not.toContain("Sin número");
  });

  test("names each presentation's level, and dashes the ones without one", () => {
    const markup = renderView({
      rows: [
        buildRow({ choreographyId: "levelled", levelLabel: "Pre Elite" }),
        buildRow({ choreographyId: "unlevelled", levelLabel: null }),
      ],
    });

    expect(markup).toContain("Pre Elite");
    expect(markup).toContain("—");
  });

  test("links a name to the academy's own choreography detail", () => {
    const markup = renderView({
      rows: [buildRow({ choreographyId: "choreography-1" })],
    });

    expect(markup).toContain("/portal/coreografias/choreography-1");
  });

  test("sends a published row's name to its evaluation detail instead", () => {
    const markup = renderView({
      rows: [
        buildRow({ choreographyId: "publicada", isResultPublished: true }),
        buildRow({ choreographyId: "sin-publicar" }),
      ],
    });

    expect(markup).toContain("/portal/presentaciones/publicada");
    expect(markup).toContain("/portal/coreografias/sin-publicar");
    expect(markup).not.toContain("/portal/coreografias/publicada");
  });
});

function buildRow(
  overrides: Partial<PortalPresentationRow> = {},
): PortalPresentationRow {
  return {
    academyName: "Academia Sur",
    categoryName: "Infantil",
    choreographyId: "choreography-1",
    choreographyNumber: 12,
    dancerNames: ["Ana Paz"],
    groupType: "solo",
    isBelowDeposit: false,
    isResultPublished: false,
    levelLabel: "Amateur",
    modalityName: "Jazz",
    name: "Pieza",
    orderNumber: 1,
    scheduledDate: "2026-05-01",
    submodalityName: null,
    ...overrides,
  };
}

function renderView(overrides: Partial<PortalPresentationsLoaderData> = {}) {
  const loaderData: PortalPresentationsLoaderData = {
    hasActiveEvent: true,
    hasPublishedPresentations: true,
    hasVisibleDay: true,
    rows: [buildRow()],
    ...overrides,
  };

  return renderToStaticMarkup(
    renderInDataRouter(
      "/portal/presentaciones",
      <PortalPresentationsListView loaderData={loaderData} />,
    ),
  );
}

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { renderInDataRouter } from "@/lib/test-support/data-router";

import type { PortalResultRow, PortalResultsLoaderData } from "./server";
import { PortalResultsListView } from "./view";

describe("PortalResultsListView", () => {
  test("shows the empty state when there is no active event", () => {
    expect(renderView({ hasActiveEvent: false, rows: [] })).toContain(
      "No hay un evento activo",
    );
  });

  test("shows the empty state while nothing is published", () => {
    expect(renderView({ rows: [] })).toContain(
      "Los resultados todavía no se publicaron",
    );
  });

  test("reads the award and the average, and links the name to the evaluation", () => {
    const markup = renderView({
      rows: [buildRow({ average: 92.5, award: "gold" })],
    });

    expect(markup).toContain("Medalla de oro");
    expect(markup).toContain("92.5");
    expect(markup).toContain("/portal/presentaciones/choreography-1");
  });

  test("reads a disqualified result as the badge and no average", () => {
    const markup = renderView({
      rows: [buildRow({ average: null, award: null, disqualified: true })],
    });

    expect(markup).toContain("Descalificada");
    expect(markup).toContain("—");
  });

  test("drops what the row competed in below sm, and keeps the rest", () => {
    const markup = renderView();
    const hiddenHeaders = [
      ...markup.matchAll(/<th[^>]*max-sm:hidden[^>]*>(.*?)<\/th>/g),
    ].map((match) => match[1]);

    expect(hiddenHeaders.join(" ")).toContain("Modalidad / Submodalidad");
    expect(hiddenHeaders.join(" ")).toContain("Categoría / Tipo de grupo");
    expect(hiddenHeaders.join(" ")).toContain("Nivel");
    expect(hiddenHeaders.join(" ")).not.toContain("Premio");
    expect(hiddenHeaders.join(" ")).not.toContain("Promedio");
  });
});

function renderView(overrides: Partial<PortalResultsLoaderData> = {}) {
  const loaderData: PortalResultsLoaderData = {
    hasActiveEvent: true,
    rows: [buildRow()],
    ...overrides,
  };

  return renderToStaticMarkup(
    renderInDataRouter(
      "/portal/resultados",
      <PortalResultsListView loaderData={loaderData} />,
    ),
  );
}

function buildRow(overrides: Partial<PortalResultRow> = {}): PortalResultRow {
  return {
    academyName: "Academia Sur",
    average: 85,
    award: "silver",
    categoryName: "Infantil",
    choreographyId: "choreography-1",
    choreographyNumber: 12,
    dancerNames: ["Ana Paz"],
    disqualified: false,
    groupType: "solo",
    isBelowDeposit: false,
    levelLabel: "Amateur",
    modalityName: "Jazz",
    name: "Pieza",
    orderNumber: 1,
    scheduledDate: "2026-05-01",
    submodalityName: null,
    ...overrides,
  };
}

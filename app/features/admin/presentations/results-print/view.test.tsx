/** @vitest-environment jsdom */

import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import type { ResultsPrintLoaderData } from "./server";
import type { ResultsPrintRow } from "./shared";
import { ResultsPrintView } from "./view";

describe("ResultsPrintView", () => {
  const renderer = createReactDomTestRenderer();
  afterEach(renderer.cleanup);

  test("reads the columns in the program's order, the results after them", () => {
    renderView();

    expect(readLines('[data-slot="table-head"]')).toEqual([
      ["N.º"],
      ["Nombre"],
      ["Academia"],
      ["Modalidad", "Submodalidad"],
      ["Categoría", "Tipo de grupo"],
      ["Bailarines"],
      ["Promedio"],
      ["Medalla"],
    ]);
  });

  test("puts each pair on two lines and the result beside it", () => {
    renderView({
      rows: [
        buildRow({
          average: 93.75,
          medal: "gold",
          modalityName: "Danza contemporánea",
          name: "Oro",
          submodalityName: "Lírico",
        }),
        buildRow({
          average: 61,
          choreographyId: "bronze",
          medal: "bronze",
          modalityName: "Tap",
          name: "Bronce",
          orderNumber: 2,
        }),
      ],
    });

    expect(readLines('[data-slot="table-cell"]')).toEqual([
      ["1"],
      ["Oro"],
      ["Academia Sur"],
      ["Danza contemporánea", "Lírico"],
      ["Infantil", "Solo"],
      ["Ana Paz"],
      ["93.75"],
      ["Medalla de oro"],
      ["2"],
      ["Bronce"],
      ["Academia Sur"],
      // No submodality: the modality stands alone.
      ["Tap"],
      ["Infantil", "Solo"],
      ["Ana Paz"],
      // The average reads the way a score does, with its point and no padding.
      ["61"],
      ["Medalla de bronce"],
    ]);
  });

  test("says so when no chosen schedule has results yet", () => {
    renderView({ rows: [], schedules: [] });

    expect(document.body.textContent).toContain(
      "Los cronogramas elegidos todavía no tienen resultados.",
    );
  });

  // The page runs are the public program's, but its caveat and its award
  // ceremony line are not: the sheet of results is unchanged (#1418), even
  // though the loader reads the same schedules the public program does.
  test("prints neither the program's caveat nor the award ceremony", () => {
    const scheduleWithCeremony = {
      id: "schedule-1",
      name: "Sábado mañana",
      scheduledDate: "2026-05-01",
      startTime: "10:00",
      awardCeremonyDate: "2026-05-01",
      awardCeremonyTime: "13:30",
    };

    renderView({ schedules: [scheduleWithCeremony] });

    expect(document.body.textContent).not.toContain("Entrega de premios");
    expect(document.body.textContent).not.toContain(
      "Los horarios son estimativos",
    );
  });

  function renderView(overrides: Partial<ResultsPrintLoaderData> = {}) {
    const loaderData: ResultsPrintLoaderData = {
      eventName: "En Escena 2026",
      rows: [buildRow()],
      schedules: [
        {
          id: "schedule-1",
          name: "Sábado mañana",
          scheduledDate: "2026-05-01",
          startTime: "10:00",
        },
      ],
      ...overrides,
    };

    renderer.render(<ResultsPrintView loaderData={loaderData} />);
  }
});

/** Each matching cell as the lines it prints: one per stacked value. */
function readLines(selector: string) {
  return [...document.querySelectorAll(selector)].map((cell) => {
    const lines = [...cell.querySelectorAll("span")].map(
      (line) => line.textContent,
    );

    return lines.length > 0 ? lines : [cell.textContent];
  });
}

function buildRow(overrides: Partial<ResultsPrintRow> = {}): ResultsPrintRow {
  return {
    academyName: "Academia Sur",
    average: 88.5,
    categoryName: "Infantil",
    choreographyId: "choreography-1",
    choreographyNumber: 12,
    dancerNames: ["Ana Paz"],
    groupType: "solo",
    isBelowDeposit: false,
    levelLabel: "Amateur",
    medal: "silver",
    modalityName: "Jazz",
    name: "Pieza",
    orderNumber: 1,
    scheduleId: "schedule-1",
    scheduledDate: "2026-05-01",
    submodalityName: null,
    ...overrides,
  };
}

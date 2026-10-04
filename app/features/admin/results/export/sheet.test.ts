import { describe, expect, test } from "vitest";

import { buildSheet } from "@/features/admin/day-export/sheet";

import { resultsExportColumns, type ResultsExportRow } from "./sheet";

function row(overrides: Partial<ResultsExportRow> = {}): ResultsExportRow {
  return {
    academyName: "Estudio Ritmo",
    academyProvince: "Córdoba",
    average: 88.5,
    award: "silver",
    categoryName: "Juvenil",
    dancerNames: ["Ana Pérez", "Bruno Gómez", "Carla Díaz", "Dario Ruiz"],
    groupType: "grupal",
    modalityName: "Danza clásica",
    name: "Lago",
    orderNumber: 7,
    scheduleName: "Sábado mañana",
    scheduledDate: "2026-10-17",
    startTime: "10:00",
    submodalityName: "Repertorio",
    ...overrides,
  };
}

function values(rows: ResultsExportRow[]) {
  return buildSheet(resultsExportColumns, rows).map((cells) =>
    cells.map((cell) =>
      cell !== null && typeof cell === "object" && "value" in cell
        ? cell.value
        : cell,
    ),
  );
}

describe("the results export sheet", () => {
  test("closes the program's columns with the dancer count, the average and the award", () => {
    const [header, cells] = values([row()]);

    expect(header.slice(-4)).toEqual([
      "Coreografía",
      "Bailarines",
      "Promedio",
      "Premio",
    ]);
    expect(cells.slice(-4)).toEqual(["Lago", 4, 88.5, "Medalla de plata"]);
  });

  test("counts a solo's one dancer like any other", () => {
    const [, cells] = values([
      row({ dancerNames: ["Ana Pérez"], groupType: "solo" }),
    ]);

    expect(cells.at(-3)).toBe(1);
  });
});

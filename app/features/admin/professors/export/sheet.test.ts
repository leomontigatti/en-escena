import { describe, expect, test } from "vitest";

import { buildSheet } from "@/features/admin/day-export/sheet";

import { professorsExportColumns, type ProfessorsExportRow } from "./sheet";

function row(
  overrides: Partial<ProfessorsExportRow> = {},
): ProfessorsExportRow {
  return {
    academyName: "Estudio Ritmo",
    documentNumber: "30111222",
    documentType: "dni",
    firstName: "Ana",
    lastName: "Pérez",
    ...overrides,
  };
}

function values(rows: ProfessorsExportRow[]) {
  return buildSheet(professorsExportColumns, rows).map((cells) =>
    cells.map((cell) =>
      cell !== null && typeof cell === "object" && "value" in cell
        ? cell.value
        : cell,
    ),
  );
}

describe("the professors export sheet", () => {
  test("heads the sheet with the professors' columns, in Spanish", () => {
    expect(values([])).toEqual([
      [
        "Nombre completo",
        "Tipo de documento",
        "Número de documento",
        "Academia",
      ],
    ]);
  });

  test("lays each professor out as one row, the document by its label", () => {
    expect(values([row()])[1]).toEqual([
      "Ana Pérez",
      "DNI",
      "30111222",
      "Estudio Ritmo",
    ]);
  });

  test("leaves the document cells blank when none was loaded", () => {
    expect(
      values([row({ documentNumber: null, documentType: null })])[1],
    ).toEqual(["Ana Pérez", null, null, "Estudio Ritmo"]);
  });
});

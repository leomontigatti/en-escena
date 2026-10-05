import { describe, expect, test } from "vitest";

import { buildSheet } from "@/features/admin/day-export/sheet";

import { dancersExportColumns, type DancersExportRow } from "./sheet";

function row(overrides: Partial<DancersExportRow> = {}): DancersExportRow {
  return {
    academyName: "Estudio Ritmo",
    birthDate: "2012-01-10",
    documentNumber: "45111222",
    documentType: "dni",
    firstName: "Ana",
    lastName: "Paz",
    ...overrides,
  };
}

describe("the dancers export sheet", () => {
  test("heads the sheet with the dancers' columns, in Spanish", () => {
    expect(buildSheet(dancersExportColumns, [])[0]).toEqual(
      [
        "Nombre completo",
        "Tipo de documento",
        "Número de documento",
        "Fecha de nacimiento",
        "Academia",
      ].map((value) => ({ fontWeight: "bold", value })),
    );
  });

  test("writes the birth date as a date cell", () => {
    const [, cells] = buildSheet(dancersExportColumns, [row()]);

    expect(cells[3]).toEqual({
      format: "dd/mm/yyyy",
      type: Date,
      value: new Date("2012-01-10T00:00:00Z"),
    });
  });

  test("leaves the document cells blank when none was loaded", () => {
    const [, cells] = buildSheet(dancersExportColumns, [
      row({ documentNumber: null, documentType: null }),
    ]);

    expect(cells.slice(0, 3)).toEqual(["Ana Paz", null, null]);
    expect(cells[4]).toBe("Estudio Ritmo");
  });
});

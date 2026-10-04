import { describe, expect, test } from "vitest";

import { buildProgramSheet, type ProgramExportRow } from "./sheet";

function row(overrides: Partial<ProgramExportRow> = {}): ProgramExportRow {
  return {
    academyName: "Estudio Ritmo",
    academyProvince: "cordoba",
    categoryName: "Juvenil",
    dancerNames: ["Ana Pérez"],
    groupType: "solo",
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

function values(sheet: ReturnType<typeof buildProgramSheet>) {
  return sheet.map((cells) =>
    cells.map((cell) =>
      cell !== null && typeof cell === "object" && "value" in cell
        ? cell.value
        : cell,
    ),
  );
}

describe("the program export sheet", () => {
  test("heads the sheet with the program's columns, in Spanish", () => {
    expect(values(buildProgramSheet([]))).toEqual([
      [
        "N.º",
        "Día",
        "Horario",
        "Categoría",
        "Tipo de grupo",
        "Modalidad",
        "Submodalidad",
        "Academia",
        "Provincia",
        "Coreografía",
        "Bailarines",
      ],
    ]);
  });

  test("lays each presentation out as one row, one dancer per line", () => {
    const [, cells] = values(
      buildProgramSheet([
        row({
          dancerNames: ["Ana Pérez", "Bruno Gómez", "Carla Díaz"],
          groupType: "trio",
        }),
      ]),
    );

    expect(cells).toEqual([
      7,
      new Date("2026-10-17T00:00:00Z"),
      "10:00 hs · Sábado mañana",
      "Juvenil",
      "Trío",
      "Danza clásica",
      "Repertorio",
      "Estudio Ritmo",
      "Córdoba",
      "Lago",
      "Ana Pérez\nBruno Gómez\nCarla Díaz",
    ]);
  });

  test("leaves a missing submodality, province or dancer list empty", () => {
    const [, cells] = values(
      buildProgramSheet([
        row({
          academyProvince: null,
          dancerNames: [],
          groupType: "grupal",
          submodalityName: null,
        }),
      ]),
    );

    expect(cells[4]).toBe("Grupal");
    expect(cells[6]).toBeNull();
    expect(cells[8]).toBeNull();
    expect(cells[10]).toBeNull();
  });
});

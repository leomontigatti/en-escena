import { describe, expect, test } from "vitest";

import { buildSheet } from "@/features/admin/day-export/sheet";

import { academiesExportColumns } from "./sheet";

describe("the academies export sheet", () => {
  test("lays each academy out as one row under Spanish headers", () => {
    const sheet = buildSheet(academiesExportColumns, [
      {
        contactName: "Nora Norte",
        email: "academia@example.com",
        name: "Estudio Ritmo",
        phone: "3415551234",
      },
    ]);

    expect(sheet[0]?.map((cell) => (cell as { value: string }).value)).toEqual([
      "Academia",
      "Responsable",
      "Teléfono",
      "Email de acceso",
    ]);
    expect(sheet[1]).toEqual([
      "Estudio Ritmo",
      "Nora Norte",
      "3415551234",
      "academia@example.com",
    ]);
  });
});

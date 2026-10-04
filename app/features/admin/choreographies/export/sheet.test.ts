import { describe, expect, test } from "vitest";

import { buildSheet } from "@/features/admin/day-export/sheet";

import { participationCountColumns } from "./sheet";

describe("the participation count sheets", () => {
  test("head each count with its grouping, then academies, dancers and inscriptions", () => {
    const [header] = buildSheet(participationCountColumns("Provincia"), []);

    expect(header?.map((cell) => (cell as { value: string }).value)).toEqual([
      "Provincia",
      "Academias",
      "Bailarines",
      "Inscripciones",
    ]);
  });

  test("write the counts as numbers, and the total row in bold", () => {
    const [, group, total] = buildSheet(
      participationCountColumns("Modalidad"),
      [
        {
          academies: 2,
          dancers: 5,
          inscriptions: 7,
          isTotal: false,
          label: "Jazz",
        },
        {
          academies: 2,
          dancers: 5,
          inscriptions: 7,
          isTotal: true,
          label: "Total",
        },
      ],
    );

    expect(group).toEqual(["Jazz", 2, 5, 7]);
    expect(total).toEqual(
      ["Total", 2, 5, 7].map((value) => ({ fontWeight: "bold", value })),
    );
  });
});

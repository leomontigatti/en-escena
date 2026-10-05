import { describe, expect, test } from "vitest";

import { buildSheet } from "@/features/admin/day-export/sheet";

import {
  collectionByGroupColumns,
  collectionMovementColumns,
  moneyFormat,
} from "./sheet";

function headers(sheet: ReturnType<typeof buildSheet>) {
  return sheet[0]?.map((cell) => (cell as { value: string }).value);
}

describe("the collection workbook's sheets", () => {
  test("lays a payment out as one movement row, its amount as money", () => {
    const sheet = buildSheet(collectionMovementColumns, [
      {
        academyName: "Estudio Ritmo",
        amount: 150000,
        date: "2026-04-10",
        kind: "movement",
        method: "mercado_pago",
        number: 42,
        type: "payment",
      },
    ]);

    expect(headers(sheet)).toEqual([
      "Movimiento",
      "Número",
      "Fecha",
      "Academia",
      "Medio",
      "Monto",
    ]);
    expect(sheet[1]).toEqual([
      "Pago",
      42,
      {
        format: "dd/mm/yyyy",
        type: Date,
        value: new Date("2026-04-10T00:00:00Z"),
      },
      "Estudio Ritmo",
      "Mercado Pago",
      { format: moneyFormat, type: Number, value: 150000 },
    ]);
  });

  test("closes the movements with a bold total, its amount under `Monto`", () => {
    const [, total] = buildSheet(collectionMovementColumns, [
      { amount: 0, kind: "total", label: "Reembolsos" },
    ]);

    expect(total).toEqual([
      { fontWeight: "bold", value: "Reembolsos" },
      null,
      null,
      null,
      null,
      { fontWeight: "bold", format: moneyFormat, type: Number, value: 0 },
    ]);
  });

  test("groups the money under the header it is grouped by", () => {
    const sheet = buildSheet(collectionByGroupColumns("Provincia"), [
      { amount: 1000, isTotal: false, label: "Córdoba" },
    ]);

    expect(headers(sheet)).toEqual(["Provincia", "Monto"]);
    expect(sheet[1]).toEqual([
      "Córdoba",
      { format: moneyFormat, type: Number, value: 1000 },
    ]);
  });
});

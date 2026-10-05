import { describe, expect, test } from "vitest";

import { buildSheet, moneyFormat } from "@/features/admin/day-export/sheet";

import { choreographyFinanceColumns, participationCountColumns } from "./sheet";

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

describe("the choreography finance sheet", () => {
  const figures = {
    allocatedAmount: 30000,
    dancerDiscountAmount: 2000,
    depositAmount: 25000,
    depositPaidAmount: 20000,
    inscriptions: 4,
    owedBalanceAmount: 18000,
    totalAmount: 48000,
    withdrawnInscriptions: 1,
  };

  test("lays a choreography out with its counts and its money", () => {
    const [header, row] = buildSheet(choreographyFinanceColumns, [
      {
        ...figures,
        academyName: "Estudio Ritmo",
        kind: "choreography",
        modalityName: "Jazz",
        name: "Amanecer",
        number: 12,
      },
    ]);
    const money = (value: number) => ({
      format: moneyFormat,
      type: Number,
      value,
    });

    expect(header?.map((cell) => (cell as { value: string }).value)).toEqual([
      "#",
      "Coreografía",
      "Academia",
      "Modalidad",
      "Inscripciones",
      "Retiradas",
      "Descuento por bailarín",
      "Seña",
      "Seña pagada",
      "Total",
      "Pagado",
      "Saldo adeudado",
    ]);
    expect(row).toEqual([
      12,
      "Amanecer",
      "Estudio Ritmo",
      "Jazz",
      4,
      1,
      money(2000),
      money(25000),
      money(20000),
      money(48000),
      money(30000),
      money(18000),
    ]);
  });

  test("leaves blank the money an inscription without a price makes unknown", () => {
    const [, row] = buildSheet(choreographyFinanceColumns, [
      {
        ...figures,
        academyName: "Estudio Ritmo",
        dancerDiscountAmount: null,
        depositAmount: null,
        depositPaidAmount: null,
        kind: "choreography",
        modalityName: "Jazz",
        name: "Amanecer",
        number: 12,
        owedBalanceAmount: null,
        totalAmount: null,
      },
    ]);

    expect(row?.slice(6)).toEqual([
      null,
      null,
      null,
      null,
      { format: moneyFormat, type: Number, value: 30000 },
      null,
    ]);
  });

  test("closes with a bold total row", () => {
    const [, total] = buildSheet(choreographyFinanceColumns, [
      { ...figures, kind: "total" },
    ]);
    const bold = (value: number) => ({ fontWeight: "bold", value });
    const boldMoney = (value: number) => ({
      fontWeight: "bold",
      format: moneyFormat,
      type: Number,
      value,
    });

    expect(total).toEqual([
      { fontWeight: "bold", value: "Total" },
      null,
      null,
      null,
      bold(4),
      bold(1),
      boldMoney(2000),
      boldMoney(25000),
      boldMoney(20000),
      boldMoney(48000),
      boldMoney(30000),
      boldMoney(18000),
    ]);
  });
});

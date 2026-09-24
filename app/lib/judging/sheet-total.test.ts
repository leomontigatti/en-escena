import { describe, expect, test } from "vitest";

import { sheetTotal, validateSheetValues } from "./sheet-total";

describe("the sheet's live total", () => {
  test("adds the adding criteria", () => {
    expect(
      sheetTotal([
        { kind: "adds", maximum: 60, value: "40" },
        { kind: "adds", maximum: 40, value: "20.5" },
      ]),
    ).toBe(60.5);
  });

  test("takes the deductions off the additions", () => {
    expect(
      sheetTotal([
        { kind: "adds", maximum: 100, value: "80" },
        { kind: "deducts", maximum: 10, value: "5.5" },
      ]),
    ).toBe(74.5);
  });

  test("counts a value the sheet could not save as nothing", () => {
    expect(
      sheetTotal([
        { kind: "adds", maximum: 100, value: "80" },
        { kind: "adds", maximum: 20, value: "12." },
        { kind: "adds", maximum: 20, value: "" },
        { kind: "deducts", maximum: 10, value: "20" },
      ]),
    ).toBe(80);
  });

  test("clamps a sheet the deductions took under zero", () => {
    expect(
      sheetTotal([
        { kind: "adds", maximum: 100, value: "10" },
        { kind: "deducts", maximum: 40, value: "40" },
      ]),
    ).toBe(0);
  });

  test("clamps a sheet whose additions overshoot 100", () => {
    expect(
      sheetTotal([
        { kind: "adds", maximum: 100, value: "100" },
        { kind: "adds", maximum: 100, value: "100" },
      ]),
    ).toBe(100);
  });
});

describe("validating a whole sheet", () => {
  const criteria = [
    { id: "tecnica", kind: "adds" as const, maximum: 60, name: "Técnica" },
    {
      id: "penal",
      kind: "deducts" as const,
      maximum: 20,
      name: "Penalización",
    },
  ];

  test("reads the total off values every criterion accepted", () => {
    expect(
      validateSheetValues(criteria, { penal: "0.5", tecnica: "50" }),
    ).toEqual({
      ok: true,
      total: 49.5,
      values: [
        { criterionId: "tecnica", value: 50 },
        { criterionId: "penal", value: 0.5 },
      ],
    });
  });

  test("names each criterion's own maximum in its message", () => {
    expect(validateSheetValues(criteria, { penal: "25", tecnica: "" })).toEqual(
      {
        fieldErrors: {
          penal: "Ingresá un valor de 0 a 20, de 0.5 en 0.5.",
          tecnica: "Ingresá un valor de 0 a 60, de 0.5 en 0.5.",
        },
        ok: false,
      },
    );
  });

  test("refuses a criterion the sheet never sent a value for", () => {
    expect(validateSheetValues(criteria, { tecnica: "50" })).toEqual({
      fieldErrors: { penal: "Ingresá un valor de 0 a 20, de 0.5 en 0.5." },
      ok: false,
    });
  });
});

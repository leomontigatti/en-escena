import { describe, expect, test } from "vitest";

import {
  addingCriteriaTotalMessage,
  criterionMaximumMessage,
  duplicateCriterionNameMessage,
} from "@/lib/judging/criteria";
import {
  generalOvershootMessage,
  sheetGaps,
  sheetRuleFor,
  validateSheetCriteria,
} from "@/lib/judging/sheet-criteria";

const stored = [
  {
    experienceLevel: null,
    kind: "adds" as const,
    maximum: 60,
    name: "Técnica",
  },
  {
    experienceLevel: null,
    kind: "deducts" as const,
    maximum: 5,
    name: "Caída",
  },
  {
    experienceLevel: "amateur" as const,
    kind: "adds" as const,
    maximum: 40,
    name: "Figuras",
  },
  {
    experienceLevel: "profesional" as const,
    kind: "adds" as const,
    maximum: 30,
    name: "Dificultad",
  },
];

const offered = {
  generalStandsAlone: false,
  levels: ["amateur", "profesional"] as const,
};

describe("the rule one sheet is saved against", () => {
  test("completes a level sheet with the general criteria, to exactly 100", () => {
    const rule = sheetRuleFor("profesional", stored, offered);

    expect(
      validateSheetCriteria(
        [{ kind: "adds", maximum: "30", name: "Dificultad" }],
        rule,
      ),
    ).toEqual({
      fieldErrors: { criteria: addingCriteriaTotalMessage },
      ok: false,
    });
    expect(
      validateSheetCriteria(
        [{ kind: "adds", maximum: "40", name: "Dificultad" }],
        rule,
      ),
    ).toEqual({ ok: true });
  });

  test("lets the general criteria leave a level short, but never above 100", () => {
    const rule = sheetRuleFor(null, stored, offered);

    expect(
      validateSheetCriteria(
        [{ kind: "adds", maximum: "50", name: "Técnica" }],
        rule,
      ),
    ).toEqual({ ok: true });
    expect(
      validateSheetCriteria(
        [{ kind: "adds", maximum: "101", name: "Técnica" }],
        rule,
      ),
    ).toEqual({
      fieldErrors: { criteria: generalOvershootMessage },
      ok: false,
    });
  });

  test("holds the general criteria to exactly 100 when a category scores on them alone", () => {
    const rule = sheetRuleFor(null, stored, {
      ...offered,
      generalStandsAlone: true,
    });

    expect(
      validateSheetCriteria(
        [{ kind: "adds", maximum: "60", name: "Técnica" }],
        rule,
      ),
    ).toEqual({
      fieldErrors: { criteria: addingCriteriaTotalMessage },
      ok: false,
    });
  });

  test("refuses a name the other part of the sheet already uses", () => {
    const rule = sheetRuleFor("amateur", stored, offered);

    expect(
      validateSheetCriteria(
        [
          { kind: "adds", maximum: "20", name: "figuras" },
          { kind: "adds", maximum: "20", name: " técnica " },
        ],
        rule,
      ),
    ).toEqual({
      fieldErrors: { "criteria.1.name": duplicateCriterionNameMessage },
      ok: false,
    });
  });

  test("takes an empty level sheet when the general criteria alone reach 100", () => {
    const general100 = [
      {
        experienceLevel: null,
        kind: "adds" as const,
        maximum: 100,
        name: "Todo",
      },
    ];

    expect(
      validateSheetCriteria([], sheetRuleFor("amateur", general100, offered)),
    ).toEqual({ ok: true });
    expect(
      validateSheetCriteria([], sheetRuleFor("amateur", stored, offered)),
    ).toEqual({
      fieldErrors: { criteria: addingCriteriaTotalMessage },
      ok: false,
    });
  });

  test("takes a sheet with no criteria at all, scored with a single value", () => {
    expect(
      validateSheetCriteria([], sheetRuleFor("amateur", [], offered)),
    ).toEqual({
      ok: true,
    });
    expect(
      validateSheetCriteria(
        [],
        sheetRuleFor(null, [], { ...offered, generalStandsAlone: true }),
      ),
    ).toEqual({ ok: true });
  });
});

describe("a sheet's maxima", () => {
  const rule = sheetRuleFor("amateur", [], offered);

  test("refuses a sheet of deductions only, which can never reach 100", () => {
    expect(
      validateSheetCriteria(
        [{ kind: "deducts", maximum: "10", name: "Caída" }],
        rule,
      ),
    ).toEqual({
      fieldErrors: { criteria: addingCriteriaTotalMessage },
      ok: false,
    });
  });

  test("reports the offending maximum and holds back the total error", () => {
    expect(
      validateSheetCriteria(
        [
          { kind: "adds", maximum: "100", name: "Técnica" },
          { kind: "adds", maximum: "0", name: "Puesta" },
        ],
        rule,
      ),
    ).toEqual({
      fieldErrors: { "criteria.1.maximum": criterionMaximumMessage },
      ok: false,
    });
  });
});

describe("the sheets a submodality leaves short", () => {
  test("names every offered sheet whose adding maxima miss 100", () => {
    expect(sheetGaps(stored, { ...offered, generalStandsAlone: true })).toEqual(
      [
        { experienceLevel: null, total: 60 },
        { experienceLevel: "profesional", total: 90 },
      ],
    );
  });

  test("leaves out a sheet with no criteria, which scores with a single value", () => {
    expect(sheetGaps([], { ...offered, generalStandsAlone: true })).toEqual([]);
  });
});

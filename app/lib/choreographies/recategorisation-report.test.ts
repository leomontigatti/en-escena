import { describe, expect, test } from "vitest";

import {
  buildRecategorisationSuffix,
  getRecategorisationReportVariant,
  type ExperienceLevelOutcome,
  type RecategorisedChoreography,
} from "./recategorisation-report";

function choreography(
  overrides: Partial<RecategorisedChoreography> = {},
): RecategorisedChoreography {
  return {
    choreographyId: "choreography-1",
    name: "Tango",
    categoryName: "Juvenil I",
    experienceLevelOutcome: "unchanged",
    ...overrides,
  };
}

const adminRepair = "Podés elegirlo desde el detalle.";
const portalRepair = "Comunicate con nosotros para poder solucionarlo.";

describe("buildRecategorisationSuffix", () => {
  test("names the new category when the level survived", () => {
    for (const surface of ["admin", "portal"] as const) {
      expect(
        buildRecategorisationSuffix({
          choreography: choreography(),
          surface,
        }),
      ).toBe("pasó a la categoría Juvenil I.");
    }
  });

  test.each<{
    outcome: Exclude<ExperienceLevelOutcome, "unchanged">;
    sentence: string;
  }>([
    {
      outcome: "cleared",
      sentence:
        "pasó a la categoría Juvenil I y quedó sin nivel de experiencia.",
    },
    {
      outcome: "keptOutsideCategory",
      sentence:
        "pasó a la categoría Juvenil I, que no ofrece su nivel de experiencia.",
    },
    {
      outcome: "arrivedWithoutLevel",
      sentence: "pasó a la categoría Juvenil I y quedó Sin nivel.",
    },
  ])(
    "words the $outcome level and points each surface at its repair",
    ({ outcome, sentence }) => {
      expect(
        buildRecategorisationSuffix({
          choreography: choreography({ experienceLevelOutcome: outcome }),
          surface: "admin",
        }),
      ).toBe(`${sentence} ${adminRepair}`);
      expect(
        buildRecategorisationSuffix({
          choreography: choreography({ experienceLevelOutcome: outcome }),
          surface: "portal",
        }),
      ).toBe(`${sentence} ${portalRepair}`);
    },
  );
});

describe("getRecategorisationReportVariant", () => {
  test.each<Exclude<ExperienceLevelOutcome, "unchanged">>([
    "cleared",
    "keptOutsideCategory",
    "arrivedWithoutLevel",
  ])("warns as soon as one line reports a %s level", (outcome) => {
    expect(
      getRecategorisationReportVariant([
        choreography(),
        choreography({ choreographyId: "b", experienceLevelOutcome: outcome }),
      ]),
    ).toBe("warning");
  });

  test("informs when every choreography kept its level", () => {
    expect(getRecategorisationReportVariant([choreography()])).toBe("info");
  });
});

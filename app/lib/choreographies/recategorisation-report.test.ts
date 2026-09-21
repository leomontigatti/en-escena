import { describe, expect, test } from "vitest";

import {
  buildRecategorisationSentence,
  getRecategorisationReportVariant,
  type RecategorisedChoreography,
} from "./recategorisation-report";

function choreography(
  overrides: Partial<RecategorisedChoreography> = {},
): RecategorisedChoreography {
  return {
    choreographyId: "choreography-1",
    name: "Tango",
    categoryName: "Juvenil I",
    experienceLevelCleared: false,
    ...overrides,
  };
}

describe("buildRecategorisationSentence", () => {
  test("names the new category when the level survived", () => {
    for (const audience of ["academy", "admin"] as const) {
      expect(
        buildRecategorisationSentence({
          audience,
          choreography: choreography(),
        }),
      ).toBe(" pasó a la categoría Juvenil I.");
    }
  });

  test("points the administrator at the detail when the level was cleared", () => {
    expect(
      buildRecategorisationSentence({
        audience: "admin",
        choreography: choreography({ experienceLevelCleared: true }),
      }),
    ).toBe(
      " pasó a la categoría Juvenil I y quedó sin nivel de experiencia. Podés elegirlo desde el detalle.",
    );
  });

  test("asks the academy to get in touch when the level was cleared", () => {
    expect(
      buildRecategorisationSentence({
        audience: "academy",
        choreography: choreography({ experienceLevelCleared: true }),
      }),
    ).toBe(
      " pasó a la categoría Juvenil I y quedó sin nivel de experiencia. Comunicate con nosotros para poder solucionarlo.",
    );
  });
});

describe("getRecategorisationReportVariant", () => {
  test("warns as soon as one line mentions a cleared level", () => {
    expect(
      getRecategorisationReportVariant([
        choreography(),
        choreography({ choreographyId: "b", experienceLevelCleared: true }),
      ]),
    ).toBe("warning");
  });

  test("informs when every choreography kept its level", () => {
    expect(getRecategorisationReportVariant([choreography()])).toBe("info");
  });
});

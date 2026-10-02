import { describe, expect, test } from "vitest";

import {
  matchesPresentationSearch,
  type PresentationSearchTarget,
} from "./search";

function target(
  overrides: Partial<PresentationSearchTarget> = {},
): PresentationSearchTarget {
  return {
    academyName: "Academia Sur",
    choreographyNumber: 34,
    name: "Luna de Papel",
    orderNumber: 7,
    ...overrides,
  };
}

describe("matchesPresentationSearch", () => {
  test("lets every row through an empty search", () => {
    expect(matchesPresentationSearch("  ", target())).toBe(true);
  });

  test("finds the name by any part of it, whatever its accents", () => {
    expect(matchesPresentationSearch("papel", target())).toBe(true);
    expect(
      matchesPresentationSearch("Río", target({ name: "Rio Arriba" })),
    ).toBe(true);
    expect(matchesPresentationSearch("sol", target())).toBe(false);
  });

  test("finds the academy only when the surface searches it", () => {
    expect(matchesPresentationSearch("sur", target())).toBe(true);
    expect(
      matchesPresentationSearch("sur", target({ academyName: undefined })),
    ).toBe(false);
  });

  test("matches a number exactly, as the presentation's or the choreography's", () => {
    expect(matchesPresentationSearch("7", target())).toBe(true);
    expect(matchesPresentationSearch("34", target())).toBe(true);
    expect(matchesPresentationSearch("00034", target())).toBe(true);
    expect(matchesPresentationSearch("3", target())).toBe(false);
    expect(matchesPresentationSearch("17", target())).toBe(false);
    expect(matchesPresentationSearch("340", target())).toBe(false);
  });

  test("never matches a row without a number by its missing number", () => {
    expect(matchesPresentationSearch("0", target({ orderNumber: null }))).toBe(
      false,
    );
  });

  test("still finds a number written into the name", () => {
    expect(matchesPresentationSearch("12", target({ name: "Pieza 12" }))).toBe(
      true,
    );
  });
});

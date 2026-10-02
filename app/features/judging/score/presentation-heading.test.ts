import { describe, expect, test } from "vitest";

import {
  formatPresentationSummary,
  formatPresentationTitle,
} from "./presentation-heading";

const presentation = {
  academyName: "Academia Sur",
  categoryName: "Juvenil",
  experienceLevel: "amateur",
  groupType: "solo" as const,
  modalityName: "Jazz",
  name: "Luna de Papel",
  orderNumber: 7,
  submodalityName: "Lírico",
};

describe("how a scoring page names its presentation", () => {
  test("titles it with its place in the program", () => {
    expect(formatPresentationTitle(presentation)).toBe("Luna de Papel · N.º 7");
  });

  test("separates the columns with dots and joins each pair with a slash", () => {
    expect(formatPresentationSummary(presentation)).toBe(
      "Academia Sur · Jazz / Lírico · Juvenil / Solo · Amateur",
    );
  });

  test("leaves out a missing submodality and level rather than drawing them empty", () => {
    expect(
      formatPresentationSummary({
        ...presentation,
        experienceLevel: null,
        submodalityName: null,
      }),
    ).toBe("Academia Sur · Jazz · Juvenil / Solo");
  });
});

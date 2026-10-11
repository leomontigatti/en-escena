import { describe, expect, test } from "vitest";

import { buildDancerBirthDateCorrectionRefusalMessage } from "@/lib/choreographies/dancer-birthdate-correction.server";

describe("buildDancerBirthDateCorrectionRefusalMessage", () => {
  // A dancer can sit in more choreographies than a field error can list. The
  // cap belongs to the shared formatter, so the refusal gets it without the
  // caller asking: the sentence names five and counts the rest.
  test("names at most five blocked choreographies and counts the rest", () => {
    const blocked = [1, 2, 3, 4, 5, 6, 7].map((choreographyNumber) => ({
      choreographyNumber,
      name: `Coreografía ${choreographyNumber}`,
    }));

    expect(buildDancerBirthDateCorrectionRefusalMessage(blocked)).toBe(
      "Con esta fecha de nacimiento, las coreografías n.º 1 «Coreografía 1», n.º 2 «Coreografía 2», n.º 3 «Coreografía 3», n.º 4 «Coreografía 4», n.º 5 «Coreografía 5» y 2 más quedan sin categoría.",
    );
  });
});

import { describe, expect, test } from "vitest";

import {
  comprobanteAnchorHref,
  formatComprobanteAnchorLabel,
} from "./anchor-reading";

describe("formatComprobanteAnchorLabel", () => {
  test("a choreography reads as its name alone", () => {
    expect(
      formatComprobanteAnchorLabel({
        kind: "choreography",
        choreographyId: "choreo_1",
        choreographyName: "Coreografía Alfa",
      }),
    ).toBe("Coreografía Alfa");
  });

  test("a seminar reads as its instructor and its date", () => {
    expect(
      formatComprobanteAnchorLabel({
        kind: "seminar",
        seminarId: "seminar_1",
        instructorName: "Abril Sosa",
        scheduledDate: "2030-10-10",
      }),
    ).toBe("Seminario Abril Sosa, 10/10/2030");
  });
});

describe("comprobanteAnchorHref", () => {
  test("links a choreography to its financial detail", () => {
    expect(
      comprobanteAnchorHref({
        academyId: "academy_1",
        reading: {
          kind: "choreography",
          choreographyId: "choreo_1",
          choreographyName: "Coreografía Alfa",
        },
      }),
    ).toBe("/administracion/finanzas/academy_1/coreografias/choreo_1");
  });

  test("links a seminar to the `(seminar, academy)` financial detail", () => {
    expect(
      comprobanteAnchorHref({
        academyId: "academy_1",
        reading: {
          kind: "seminar",
          seminarId: "seminar_1",
          instructorName: "Abril Sosa",
          scheduledDate: "2030-10-10",
        },
      }),
    ).toBe("/administracion/finanzas/academy_1/seminarios/seminar_1");
  });
});

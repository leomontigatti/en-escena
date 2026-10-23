import { describe, expect, test } from "vitest";

import { describeBulkDuration, resolveBulkCbteFchBounds } from "./bulk";

describe("bulk emission date", () => {
  const cbteFch = {
    today: "2026-07-22",
    floors: {
      factura_c: { floor: "2026-07-12", description: "ventana" },
      nota_credito_c: { floor: "2026-07-18", description: "serie NC" },
    },
  };

  test("is bounded by the latest floor among the series the run emits in", () => {
    expect(
      resolveBulkCbteFchBounds(cbteFch, ["factura_c", "nota_credito_c"]),
    ).toEqual({
      floor: "2026-07-18",
      description: "serie NC",
      max: "2026-07-22",
    });
    expect(resolveBulkCbteFchBounds(cbteFch, ["factura_c"])).toMatchObject({
      floor: "2026-07-12",
    });
  });

  test("has no bounds when the run emits nothing", () => {
    expect(resolveBulkCbteFchBounds(cbteFch, [])).toBeNull();
  });
});

describe("bulk emission duration", () => {
  test("states seconds for a short run and minutes, rounded up, for a long one", () => {
    expect(describeBulkDuration(2)).toBe(
      "Suele tardar entre 20 segundos y 40 segundos, y hasta 2 minutos si ARCA demora.",
    );
    expect(describeBulkDuration(7)).toBe(
      "Suele tardar entre 2 minutos y 3 minutos, y hasta 7 minutos si ARCA demora.",
    );
  });
});

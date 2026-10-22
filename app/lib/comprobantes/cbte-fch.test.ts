import { describe, expect, test } from "vitest";

import { checkCbteFch, deriveCbteFchBounds } from "./cbte-fch";

const series = { ptoVta: 1, cbteTipo: 11 };

describe("deriveCbteFchBounds", () => {
  test("the floor is the series' last authorized date when it is later than ten days ago", () => {
    expect(
      deriveCbteFchBounds({
        series,
        today: "2026-10-21",
        lastAuthorizedCbteFch: "20261015",
      }),
    ).toMatchObject({
      floor: "2026-10-15",
      floorReason: "series",
      max: "2026-10-21",
    });
  });

  test("the floor is ten days ago when the series' last date is older, or the series is empty", () => {
    for (const lastAuthorizedCbteFch of ["20260901", null]) {
      expect(
        deriveCbteFchBounds({
          series,
          today: "2026-10-03",
          lastAuthorizedCbteFch,
        }),
      ).toMatchObject({ floor: "2026-09-23", floorReason: "window" });
    }
  });
});

describe("checkCbteFch", () => {
  const bounds = deriveCbteFchBounds({
    series,
    today: "2026-10-21",
    lastAuthorizedCbteFch: "20261015",
  });

  test("accepts the floor and today", () => {
    expect(checkCbteFch("2026-10-15", bounds)).toBeNull();
    expect(checkCbteFch("2026-10-21", bounds)).toBeNull();
  });

  test("refuses a date below the floor, naming the series that sets it", () => {
    expect(checkCbteFch("2026-10-14", bounds)).toBe(
      "La fecha no puede ser anterior al 15/10/2026, la del último comprobante autorizado en la serie Factura C, punto de venta 0001: ARCA no acepta fechas anteriores en esa serie.",
    );
  });

  test("refuses a date below the ten-day window, naming the series", () => {
    expect(
      checkCbteFch(
        "2026-09-22",
        deriveCbteFchBounds({
          series: { ptoVta: 1, cbteTipo: 13 },
          today: "2026-10-03",
          lastAuthorizedCbteFch: null,
        }),
      ),
    ).toBe(
      "La fecha no puede ser anterior al 23/09/2026: ARCA no acepta comprobantes de servicios fechados más de 10 días antes de hoy (Nota de crédito C, punto de venta 0001).",
    );
  });

  test("refuses a date after today, and one that is not a date", () => {
    expect(checkCbteFch("2026-10-22", bounds)).toBe(
      "La fecha no puede ser posterior a hoy.",
    );
    expect(checkCbteFch("2026-02-30", bounds)).toBe(
      "Elegí una fecha válida para el comprobante.",
    );
  });
});

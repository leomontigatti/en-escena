import { afterEach, describe, expect, test, vi } from "vitest";

import { isDateOnly, isFutureDateOnly } from "./date-only";

afterEach(() => {
  vi.useRealTimers();
});

describe("isDateOnly", () => {
  test("acepta fechas con forma YYYY-MM-DD y rechaza el resto", () => {
    expect(isDateOnly("2026-05-31")).toBe(true);
    expect(isDateOnly("2026-02-30")).toBe(false);
    expect(isDateOnly("31/05/2026")).toBe(false);
    expect(isDateOnly("2026-5-31")).toBe(false);
  });
});

describe("isFutureDateOnly", () => {
  // "Hoy" es el día del negocio, no el del servidor: a las 23:30 del 31 en
  // Córdoba (02:30 UTC del 1) el 31 todavía no es futuro y el 1 sí lo es.
  test("resuelve hoy en la zona horaria del negocio", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T02:30:00Z"));

    expect(isFutureDateOnly("2026-05-31")).toBe(false);
    expect(isFutureDateOnly("2026-06-01")).toBe(true);
  });
});

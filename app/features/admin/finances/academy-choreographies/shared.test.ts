import { afterEach, describe, expect, test, vi } from "vitest";

import { defaultRegisterPaymentValues } from "./shared";

afterEach(() => {
  vi.useRealTimers();
});

describe("defaultRegisterPaymentValues", () => {
  // A las 23:30 del 31 en Córdoba (02:30 UTC del 1) el pago que se está
  // cargando es del 31: el formulario no puede prefijar el día siguiente.
  test("prefija la fecha de pago del día del negocio", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T02:30:00Z"));

    expect(defaultRegisterPaymentValues().paymentDate).toBe("2026-05-31");
  });
});

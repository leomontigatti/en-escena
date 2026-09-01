import { afterEach, describe, expect, test, vi } from "vitest";

import { defaultRegisterPaymentValues } from "./shared";

afterEach(() => {
  vi.useRealTimers();
});

describe("defaultRegisterPaymentValues", () => {
  // At 23:30 on the 31st in Córdoba (02:30 UTC on the 1st) the payment being
  // entered is the 31st's: the form cannot prefill the following day.
  test("prefija la fecha de pago del día del negocio", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T02:30:00Z"));

    expect(defaultRegisterPaymentValues().paymentDate).toBe("2026-05-31");
  });
});

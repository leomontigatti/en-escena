import { afterEach, describe, expect, test, vi } from "vitest";

import { isDateOnly, isFutureDateOnly } from "./date-only";

afterEach(() => {
  vi.useRealTimers();
});

describe("isDateOnly", () => {
  test("accepts YYYY-MM-DD shaped dates and rejects the rest", () => {
    expect(isDateOnly("2026-05-31")).toBe(true);
    expect(isDateOnly("2026-02-30")).toBe(false);
    expect(isDateOnly("31/05/2026")).toBe(false);
    expect(isDateOnly("2026-5-31")).toBe(false);
  });
});

describe("isFutureDateOnly", () => {
  // "Today" is the business day, not the server's: at 23:30 on the 31st in Córdoba
  // (02:30 UTC on the 1st) the 31st is not yet in the future and the 1st is.
  test("resolves today in the business time zone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T02:30:00Z"));

    expect(isFutureDateOnly("2026-05-31")).toBe(false);
    expect(isFutureDateOnly("2026-06-01")).toBe(true);
  });
});

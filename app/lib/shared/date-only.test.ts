import { afterEach, describe, expect, test, vi } from "vitest";

import {
  formatDateOnlyAsDayMonthYear,
  isDateOnly,
  isFutureDateOnly,
  parseDayMonthYear,
} from "./date-only";

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

  // A month and a day that do not exist still fit the shape, and answering
  // them used to throw instead of returning `false`.
  test("rejects impossible dates without throwing", () => {
    expect(isDateOnly("2026-13-40")).toBe(false);
    expect(isDateOnly("0000-00-00")).toBe(false);
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

describe("parseDayMonthYear", () => {
  test("reads day, month and year in the order Argentina writes them", () => {
    expect(parseDayMonthYear("15/03/2012")).toEqual({
      ok: true,
      dateOnly: "2012-03-15",
    });
    expect(parseDayMonthYear("1-3-2012")).toEqual({
      ok: true,
      dateOnly: "2012-03-01",
    });
    expect(parseDayMonthYear(" 01.03.2012 ")).toEqual({
      ok: true,
      dateOnly: "2012-03-01",
    });
  });

  // `03/04` is the 3rd of April here, never March 4th.
  test("never reads the month first", () => {
    expect(parseDayMonthYear("03/04/2012")).toEqual({
      ok: true,
      dateOnly: "2012-04-03",
    });
  });

  test("refuses a two-digit year rather than guessing its century", () => {
    expect(parseDayMonthYear("15/03/12")).toEqual({
      ok: false,
      reason: "short-year",
    });
  });

  test("refuses a day the month does not have instead of rolling it over", () => {
    expect(parseDayMonthYear("31/02/2012")).toEqual({
      ok: false,
      reason: "impossible",
    });
    expect(parseDayMonthYear("15/13/2012")).toEqual({
      ok: false,
      reason: "impossible",
    });
  });

  test("refuses what is not a day, a month and a year", () => {
    for (const text of ["", "15/03", "15032012", "2012-03-15", "15/03/2012x"]) {
      expect(parseDayMonthYear(text)).toEqual({ ok: false, reason: "format" });
    }
  });
});

describe("formatDateOnlyAsDayMonthYear", () => {
  test("writes a date-only value the way it is typed", () => {
    expect(formatDateOnlyAsDayMonthYear("2012-03-01")).toBe("01/03/2012");
  });
});

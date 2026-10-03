import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  buildBirthDateRefinement,
  birthDateFormatMessage,
  futureBirthDateMessage,
  getLatestEligibleBirthDate,
  getOverageDancersMessage,
  getUnderageDancersMessage,
  invalidBirthDateMessage,
  isOldEnoughAtEventStart,
  isYoungEnoughAtEventStart,
  overageBirthDateMessage,
  shortBirthYearMessage,
  underageBirthDateMessage,
} from "@/lib/dancers/birth-date";

const eventStartDate = "2026-09-25";

describe("birth date refinement", () => {
  test("rejects a value that is not a real date", () => {
    expect(parseBirthDate("2026-02-30")).toEqual([invalidBirthDateMessage]);
    expect(parseBirthDate("25/09/2015")).toEqual([invalidBirthDateMessage]);
  });

  // The field posts a date-only value once what was typed reads as a date, and
  // what was typed when it does not: the message says what to fix in it.
  test("says what to fix in a typed date that does not read as one", () => {
    expect(parseBirthDate("15/03")).toEqual([birthDateFormatMessage]);
    expect(parseBirthDate("15/03/12")).toEqual([shortBirthYearMessage]);
    expect(parseBirthDate("31/02/2012")).toEqual([invalidBirthDateMessage]);
  });

  test("rejects a date in the future", () => {
    expect(parseBirthDate("2999-01-01")).toEqual([futureBirthDateMessage]);
  });

  test("rejects a dancer who is not yet one at the event's start", () => {
    expect(parseBirthDate("2026-01-15")).toEqual([underageBirthDateMessage]);
    expect(parseBirthDate("2025-09-26")).toEqual([underageBirthDateMessage]);
  });

  test("accepts a dancer who turns one exactly on the event's start", () => {
    expect(parseBirthDate("2025-09-25")).toEqual([]);
  });

  test("rejects a dancer who would be over a hundred at the event's start", () => {
    expect(parseBirthDate("1925-09-25")).toEqual([overageBirthDateMessage]);
    expect(parseBirthDate("1905-01-15")).toEqual([overageBirthDateMessage]);
  });

  test("accepts a dancer who turns a hundred exactly on the event's start", () => {
    expect(parseBirthDate("1926-09-25")).toEqual([]);
  });

  test("applies only the date checks without an event start", () => {
    expect(parseBirthDate("2026-01-15", null)).toEqual([]);
    expect(parseBirthDate("1905-01-15", null)).toEqual([]);
    expect(parseBirthDate("2026-02-30", null)).toEqual([
      invalidBirthDateMessage,
    ]);
  });

  test("names the newest birth date that still competes", () => {
    expect(getLatestEligibleBirthDate(eventStartDate)).toBe("2025-09-25");
  });
});

describe("registration age guard", () => {
  test("admits an age of exactly one and refuses anything under it", () => {
    expect(isOldEnoughAtEventStart(1)).toBe(true);
    expect(isOldEnoughAtEventStart(0)).toBe(false);
  });

  test("admits an age of exactly a hundred and refuses anything over it", () => {
    expect(isYoungEnoughAtEventStart(100)).toBe(true);
    expect(isYoungEnoughAtEventStart(101)).toBe(false);
  });

  test("names every dancer that blocks the registration", () => {
    expect(getUnderageDancersMessage(["Nina Ríos"])).toContain("Nina Ríos");
    expect(getUnderageDancersMessage(["Nina Ríos", "Lía Paz"])).toContain(
      "Nina Ríos, Lía Paz",
    );
    expect(getOverageDancersMessage(["Nina Ríos"])).toContain("Nina Ríos");
    expect(getOverageDancersMessage(["Nina Ríos", "Lía Paz"])).toContain(
      "Nina Ríos, Lía Paz",
    );
  });
});

function parseBirthDate(
  value: string,
  eventStart: string | null = eventStartDate,
) {
  const result = z
    .string()
    .superRefine(buildBirthDateRefinement(eventStart))
    .safeParse(value);

  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

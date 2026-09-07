import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  buildBirthDateRefinement,
  futureBirthDateMessage,
  getLatestEligibleBirthDate,
  invalidBirthDateMessage,
  underageBirthDateMessage,
} from "@/lib/dancers/birth-date";

const eventStartDate = "2026-09-25";

describe("birth date refinement", () => {
  test("rejects a value that is not a real date", () => {
    expect(parseBirthDate("2026-02-30")).toEqual([invalidBirthDateMessage]);
    expect(parseBirthDate("25/09/2015")).toEqual([invalidBirthDateMessage]);
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

  test("applies only the date checks without an event start", () => {
    expect(parseBirthDate("2026-01-15", null)).toEqual([]);
    expect(
      z.string().superRefine(buildBirthDateRefinement()).safeParse("2026-01-15")
        .success,
    ).toBe(true);
    expect(parseBirthDate("2026-02-30", null)).toEqual([
      invalidBirthDateMessage,
    ]);
  });

  test("names the newest birth date that still competes", () => {
    expect(getLatestEligibleBirthDate(eventStartDate)).toBe("2025-09-25");
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

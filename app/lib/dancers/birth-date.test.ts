import { describe, expect, test } from "vitest";
import { z } from "zod";

import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";
import {
  buildBirthDateRefinement,
  getBirthDatePickerBounds,
  futureBirthDateMessage,
  getLatestEligibleBirthDate,
  getUnderageDancersMessage,
  invalidBirthDateMessage,
  isOldEnoughAtEventStart,
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

  test("names every dancer that blocks the registration", () => {
    expect(getUnderageDancersMessage(["Nina Ríos"])).toContain("Nina Ríos");
    expect(getUnderageDancersMessage(["Nina Ríos", "Lía Paz"])).toContain(
      "Nina Ríos, Lía Paz",
    );
  });
});

describe("birth date picker bounds", () => {
  test("opens on a plausible birth year, well before the bound", () => {
    const bounds = getBirthDatePickerBounds(eventStartDate);

    expect(bounds.defaultMonth.getFullYear()).toBe(2014);
    expect(bounds.defaultMonth.getMonth()).toBe(8);
  });

  test("offers no month after the newest birth date that still competes", () => {
    const bounds = getBirthDatePickerBounds(eventStartDate);

    expect(bounds.endMonth.getFullYear()).toBe(2025);
    expect(bounds.endMonth.getMonth()).toBe(8);
  });

  test("falls back to today without an active event", () => {
    const [year, month, day] = getBusinessDateOnly().split("-").map(Number);

    for (const eventStart of [null, "no-es-fecha"]) {
      const bounds = getBirthDatePickerBounds(eventStart);

      expect(bounds.defaultMonth.getFullYear()).toBe(year);
      expect(bounds.defaultMonth.getMonth()).toBe(month - 1);
      expect(bounds.endMonth.getFullYear()).toBe(year);
      expect(bounds.endMonth.getMonth()).toBe(month - 1);
      expect(bounds.latestSelectableDate).toEqual(
        new Date(year, month - 1, day),
      );
    }
  });

  test("offers no day after the newest birth date that still competes", () => {
    expect(
      getBirthDatePickerBounds(eventStartDate).latestSelectableDate,
    ).toEqual(new Date(2025, 8, 25));
  });

  test("keeps the day bound inside the bound month", () => {
    const bounds = getBirthDatePickerBounds(eventStartDate);

    expect(bounds.latestSelectableDate.getFullYear()).toBe(
      bounds.endMonth.getFullYear(),
    );
    expect(bounds.latestSelectableDate.getMonth()).toBe(
      bounds.endMonth.getMonth(),
    );
  });

  test("clamps a bound day that its month does not have", () => {
    // 2028 is a leap year and 2027 is not: the newest eligible birth date for an
    // event starting on 29 February is a day that does not exist.
    expect(getBirthDatePickerBounds("2028-02-29").latestSelectableDate).toEqual(
      new Date(2027, 1, 28),
    );
  });

  test("offers the same oldest month with and without an active event", () => {
    expect(getBirthDatePickerBounds(eventStartDate).startMonth).toEqual(
      getBirthDatePickerBounds(null).startMonth,
    );
    expect(
      getBirthDatePickerBounds(eventStartDate).startMonth.getFullYear(),
    ).toBe(1900);
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

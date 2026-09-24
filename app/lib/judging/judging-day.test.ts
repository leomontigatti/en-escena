import { describe, expect, test } from "vitest";

import { isOpenForJudges, judgingDate } from "@/lib/judging/judging-day";

/**
 * Business time is UTC-3 all year, so a business instant is written here as the
 * UTC one three hours later.
 */
function businessInstant(text: string) {
  return new Date(`${text}-03:00`);
}

describe("the judging day", () => {
  test("is the business date of three hours ago", () => {
    expect(judgingDate(businessInstant("2026-10-10T21:30:00"))).toBe(
      "2026-10-10",
    );
  });

  test("keeps the previous day until 03:00 business time", () => {
    expect(judgingDate(businessInstant("2026-10-11T00:00:00"))).toBe(
      "2026-10-10",
    );
    expect(judgingDate(businessInstant("2026-10-11T02:59:59"))).toBe(
      "2026-10-10",
    );
    expect(judgingDate(businessInstant("2026-10-11T03:00:00"))).toBe(
      "2026-10-11",
    );
  });

  test("opens a presentation exactly on the day its schedule is on", () => {
    const now = businessInstant("2026-10-11T01:00:00");

    expect(isOpenForJudges("2026-10-10", now)).toBe(true);
    expect(isOpenForJudges("2026-10-11", now)).toBe(false);
    expect(isOpenForJudges("2026-10-09", now)).toBe(false);
  });

  test("closes the day once 03:00 has passed", () => {
    expect(
      isOpenForJudges("2026-10-10", businessInstant("2026-10-11T03:00:00")),
    ).toBe(false);
  });
});

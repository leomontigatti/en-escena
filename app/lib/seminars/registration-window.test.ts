import { describe, expect, test } from "vitest";

import {
  getSeminarStartsAt,
  hasSeminarStarted,
} from "@/lib/seminars/registration-window";

const seminar = { scheduledDate: "2026-10-10", startTime: "18:30" };

describe("seminar registration window", () => {
  test("reads the date and the time as business-time values", () => {
    expect(getSeminarStartsAt(seminar).toISOString()).toBe(
      "2026-10-10T21:30:00.000Z",
    );
  });

  test("closes registration from the start time on", () => {
    expect(
      hasSeminarStarted(seminar, new Date("2026-10-10T21:29:00.000Z")),
    ).toBe(false);
    expect(
      hasSeminarStarted(seminar, new Date("2026-10-10T21:30:00.000Z")),
    ).toBe(true);
    expect(
      hasSeminarStarted(seminar, new Date("2026-10-10T21:31:00.000Z")),
    ).toBe(true);
  });
});

import { describe, expect, test } from "vitest";

import {
  doesSeminarStartBeforePaymentDeadline,
  isSeminarReservationLive,
} from "./seminar-reservations";

const now = new Date("2026-10-11T12:00:00-03:00");

describe("isSeminarReservationLive", () => {
  test("holds until the stored moment and not at it", () => {
    const reservedUntil = new Date("2026-10-11T12:00:01-03:00");

    expect(isSeminarReservationLive(reservedUntil, now)).toBe(true);
    expect(
      isSeminarReservationLive(reservedUntil, new Date(reservedUntil)),
    ).toBe(false);
  });

  test("is no reservation when none was given", () => {
    expect(isSeminarReservationLive(null, now)).toBe(false);
  });
});

describe("doesSeminarStartBeforePaymentDeadline", () => {
  test("is false while the seminar starts after the 48 hours the academy is given", () => {
    expect(
      doesSeminarStartBeforePaymentDeadline(
        { scheduledDate: "2026-10-13", startTime: "12:00" },
        now,
      ),
    ).toBe(false);
  });

  test("is true when the seminar starts inside those 48 hours", () => {
    expect(
      doesSeminarStartBeforePaymentDeadline(
        { scheduledDate: "2026-10-13", startTime: "11:59" },
        now,
      ),
    ).toBe(true);
  });
});

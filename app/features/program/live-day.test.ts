import { describe, expect, test } from "vitest";

import {
  isProgramDayLive,
  readProgramLiveDay,
  showsPresentedMarks,
  type ProgramLiveDay,
} from "./live-day";

/**
 * Business time is UTC-3 all year, so a business instant is written here as the
 * UTC one three hours later.
 */
function businessInstant(text: string) {
  return new Date(`${text}-03:00`);
}

const day: ProgramLiveDay = {
  date: "2026-12-09",
  isOver: false,
  presentedChoreographyIds: [],
  startTime: "18:00",
};

describe("readProgramLiveDay", () => {
  const rows = [
    { choreographyId: "a", orderNumber: 1, scheduledDate: "2026-12-09" },
    { choreographyId: "b", orderNumber: 2, scheduledDate: "2026-12-09" },
    { choreographyId: "c", orderNumber: 3, scheduledDate: "2026-12-10" },
  ];
  const schedules = [
    { scheduledDate: "2026-12-09", startTime: "21:00" },
    { scheduledDate: "2026-12-09", startTime: "18:00" },
    { scheduledDate: "2026-12-10", startTime: "10:00" },
  ];
  const at = businessInstant("2026-12-09T12:00:00");

  test("is the judging day: its first start time and only its presented rows", () => {
    expect(
      readProgramLiveDay({
        now: at,
        presentedChoreographyIds: new Set(["a", "c"]),
        rows,
        schedules,
      }),
    ).toEqual({
      date: "2026-12-09",
      isOver: false,
      presentedChoreographyIds: ["a"],
      startTime: "18:00",
    });
  });

  test("is over once the day's last presentation is presented", () => {
    expect(
      readProgramLiveDay({
        now: at,
        presentedChoreographyIds: new Set(["b"]),
        rows,
        schedules,
      })?.isOver,
    ).toBe(true);
  });

  test("is nothing on a day the program has no rows for", () => {
    expect(
      readProgramLiveDay({
        now: businessInstant("2026-12-11T20:00:00"),
        presentedChoreographyIds: new Set(),
        rows,
        schedules,
      }),
    ).toBeNull();
  });
});

describe("isProgramDayLive", () => {
  test("starts at the day's first start time", () => {
    expect(isProgramDayLive(day, businessInstant("2026-12-09T17:59:00"))).toBe(
      false,
    );
    expect(isProgramDayLive(day, businessInstant("2026-12-09T18:00:00"))).toBe(
      true,
    );
  });

  test("runs past midnight and ends at 03:00", () => {
    expect(isProgramDayLive(day, businessInstant("2026-12-10T02:59:00"))).toBe(
      true,
    );
    expect(isProgramDayLive(day, businessInstant("2026-12-10T03:00:00"))).toBe(
      false,
    );
  });

  test("ends when the day's last presentation is presented", () => {
    expect(
      isProgramDayLive(
        { ...day, isOver: true },
        businessInstant("2026-12-09T22:00:00"),
      ),
    ).toBe(false);
  });
});

describe("showsPresentedMarks", () => {
  test("holds the whole judging day, before the show and after it ends", () => {
    const over = { ...day, isOver: true };

    expect(
      showsPresentedMarks(over, businessInstant("2026-12-09T09:00:00")),
    ).toBe(true);
    expect(
      showsPresentedMarks(over, businessInstant("2026-12-10T02:59:00")),
    ).toBe(true);
    expect(
      showsPresentedMarks(over, businessInstant("2026-12-10T03:00:00")),
    ).toBe(false);
  });
});

import { describe, expect, test } from "vitest";

import { formatProgramAwardCeremonyLabel } from "./print";

const schedule = {
  id: "schedule-1",
  name: "Bloque tarde",
  scheduledDate: "2026-12-01",
  startTime: "16:00",
};

describe("formatProgramAwardCeremonyLabel", () => {
  // On the schedule's own day the hour is enough: the page run's heading
  // already names the day.
  test("reads the hour alone on the schedule's own day", () => {
    expect(
      formatProgramAwardCeremonyLabel({
        ...schedule,
        awardCeremonyDate: "2026-12-01",
        awardCeremonyTime: "22:30",
      }),
    ).toBe("Entrega de premios · 22:30 hs");
  });

  // After midnight the ceremony falls on the next day, and the line names it
  // the way the heading names the schedule's.
  test("names the day when it is not the schedule's", () => {
    expect(
      formatProgramAwardCeremonyLabel({
        ...schedule,
        awardCeremonyDate: "2026-12-02",
        awardCeremonyTime: "00:15",
      }),
    ).toBe("Entrega de premios · miércoles 2 de diciembre 00:15 hs");
  });

  test("answers nothing for a schedule without a ceremony", () => {
    expect(
      formatProgramAwardCeremonyLabel({
        ...schedule,
        awardCeremonyDate: null,
        awardCeremonyTime: null,
      }),
    ).toBeNull();
  });
});

import { describe, expect, test } from "vitest";

import {
  appendScheduleOccupancySuffix,
  formatScheduleDateTime,
  formatScheduleDayLabel,
} from "@/lib/choreographies/schedule-formatters";

const schedule = {
  name: "Jornada 1",
  scheduledDate: "2026-05-01",
  startTime: "14:00:00",
};

describe("schedule formatters", () => {
  test("appends the occupancy to the existing schedule label format", () => {
    const label = formatScheduleDateTime(schedule);

    expect(
      appendScheduleOccupancySuffix(label, {
        capacity: 5,
        isFull: false,
        occupiedCount: 3,
      }),
    ).toBe("1 de mayo de 2026 - 14:00 hs. · 3/5 ocupados");
  });

  test("marks a full option without hiding its count", () => {
    expect(
      appendScheduleOccupancySuffix(formatScheduleDateTime(schedule), {
        capacity: 5,
        isFull: true,
        occupiedCount: 5,
      }),
    ).toBe("1 de mayo de 2026 - 14:00 hs. · 5/5 ocupados · sin cupo");
  });

  // The specific capacity may have room while the schedule containing it does not.
  test("says `sin cupo` even when the count alone does not explain it", () => {
    expect(
      appendScheduleOccupancySuffix("Cronograma", {
        capacity: 5,
        isFull: true,
        occupiedCount: 2,
      }),
    ).toBe("Cronograma · 2/5 ocupados · sin cupo");
  });

  test("leaves the assigned schedule label free of occupancy", () => {
    expect(formatScheduleDateTime(schedule)).toBe(
      "1 de mayo de 2026 - 14:00 hs.",
    );
  });

  test("names a day the same way the schedule label does, without its time", () => {
    expect(formatScheduleDayLabel(schedule.scheduledDate)).toBe(
      "1 de mayo de 2026",
    );
  });

  // The date is read as written, never shifted by the reader's time zone: from
  // Córdoba, a day parsed as UTC midnight and formatted locally goes back one.
  test("keeps the day the schedule was saved with", () => {
    expect(formatScheduleDayLabel("2026-01-01")).toBe("1 de enero de 2026");
  });

  test("hands back a date that is shaped right but impossible", () => {
    expect(formatScheduleDayLabel("2026-13-40")).toBe("2026-13-40");
  });
});

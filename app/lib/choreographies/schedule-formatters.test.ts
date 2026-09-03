import { describe, expect, test } from "vitest";

import {
  appendScheduleOccupancySuffix,
  formatScheduleDateTime,
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
});

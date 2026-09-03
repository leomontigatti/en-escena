import { describe, expect, test } from "vitest";

import {
  isEveryScheduleCapacityOptionFull,
  toScheduleCapacitySelectOptions,
} from "./schedule-capacity-options";

describe("toScheduleCapacitySelectOptions", () => {
  test("disables the options whose capacity is full and no others", () => {
    expect(
      toScheduleCapacitySelectOptions([
        {
          id: "schedule_capacity_1",
          isFull: false,
          label: "1 de mayo de 2026 - 14:00 hs. · 3/5 ocupados",
        },
        {
          id: "schedule_capacity_2",
          isFull: true,
          label: "2 de mayo de 2026 - 10:00 hs. · 5/5 ocupados · sin cupo",
        },
      ]),
    ).toEqual([
      {
        disabled: false,
        label: "1 de mayo de 2026 - 14:00 hs. · 3/5 ocupados",
        value: "schedule_capacity_1",
      },
      {
        disabled: true,
        label: "2 de mayo de 2026 - 10:00 hs. · 5/5 ocupados · sin cupo",
        value: "schedule_capacity_2",
      },
    ]);
  });
});

describe("isEveryScheduleCapacityOptionFull", () => {
  test("is true only when no option has room left", () => {
    expect(
      isEveryScheduleCapacityOptionFull([
        { id: "schedule_capacity_1", isFull: true, label: "Primero" },
        { id: "schedule_capacity_2", isFull: true, label: "Segundo" },
      ]),
    ).toBe(true);
    expect(
      isEveryScheduleCapacityOptionFull([
        { id: "schedule_capacity_1", isFull: true, label: "Primero" },
        { id: "schedule_capacity_2", isFull: false, label: "Segundo" },
      ]),
    ).toBe(false);
  });

  test("is false without options, because there is nothing full to report", () => {
    expect(isEveryScheduleCapacityOptionFull([])).toBe(false);
  });
});

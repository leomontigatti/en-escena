import { describe, expect, test } from "vitest";

import {
  formatPeopleNames,
  formatScheduleSummary,
} from "@/features/portal/choreographies/create/formatters";
import type { RegistrationResolution } from "@/features/portal/choreographies/create/flow";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";

describe("choreography creation summary formatters", () => {
  test("formats schedule and roster summaries for the confirmation step", () => {
    const autoScheduleResolution: RegistrationResolution = {
      category: { status: "resolved", id: "category_1", name: "Juvenil" },
      categoryAgeBasis: 14,
      categoryCalculationMode: "oldest",
      dancers: [],
      experienceLevel: { required: false, options: [] },
      groupType: "solo",
      schedule: {
        status: "auto",
        canConfirm: true,
        scheduleCapacityId: "capacity_1",
        options: [
          {
            id: "capacity_1",
            scheduleId: "schedule_1",
            scheduleCapacityId: "capacity_1",
            capacity: 8,
            groupType: "solo",
            usesGlobalCapacity: false,
            schedule: {
              id: "schedule_1",
              name: "Bloque tarde",
              scheduledDate: "2026-05-01",
              startTime: "14:30:00",
            },
          },
        ],
      },
    };

    expect(
      formatScheduleDateTime({
        name: "Bloque tarde",
        scheduledDate: "2026-05-01",
        startTime: "14:30:00",
      }),
    ).toBe("1 de mayo de 2026 - 14:30 hs.");

    expect(formatScheduleSummary(autoScheduleResolution, "")).toBe(
      "1 de mayo de 2026 - 14:30 hs.",
    );

    // The row's label carries the count, so every name is listed.
    expect(
      formatPeopleNames([
        { firstName: "Ana", lastName: "Paz" },
        { firstName: "Luz", lastName: "Suárez" },
        { firstName: "Mora", lastName: "Díaz" },
        { firstName: "Tina", lastName: "Gil" },
      ]),
    ).toBe("Ana Paz, Luz Suárez, Mora Díaz, Tina Gil");
  });
});

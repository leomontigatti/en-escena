import { describe, expect, test } from "vitest";

import {
  formatPeopleSummary,
  formatScheduleDateTime,
  formatScheduleSummary,
} from "@/components/portal/choreography-create-dialog/formatters";

describe("choreography create dialog formatters", () => {
  test("formats schedule and people summaries for the confirmation step", () => {
    expect(
      formatScheduleDateTime({
        name: "Bloque tarde",
        scheduledDate: "2026-05-01",
        startTime: "14:30:00",
      }),
    ).toBe("1 de mayo de 2026 - 14:30 hs.");

    expect(
      formatScheduleSummary(
        {
          category: { status: "resolved", name: "Juvenil" },
          dancers: [],
          experienceLevel: { required: false, options: [] },
          groupType: "solo",
          schedule: {
            status: "auto",
            scheduleCapacityId: "capacity_1",
            options: [
              {
                id: "capacity_1",
                schedule: {
                  name: "Bloque tarde",
                  scheduledDate: "2026-05-01",
                  startTime: "14:30:00",
                },
              },
            ],
          },
        } as never,
        "",
      ),
    ).toBe("1 de mayo de 2026 - 14:30 hs.");

    expect(
      formatPeopleSummary(
        [
          { firstName: "Ana", lastName: "Paz" },
          { firstName: "Luz", lastName: "Suárez" },
          { firstName: "Mora", lastName: "Díaz" },
          { firstName: "Tina", lastName: "Gil" },
        ],
        "bailarines",
      ),
    ).toBe("4 bailarines seleccionados");
  });
});

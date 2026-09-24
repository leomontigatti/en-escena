import { afterEach, describe, expect, test, vi } from "vitest";

const findSchedules = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    query: {
      schedules: {
        findMany: findSchedules,
      },
    },
  },
}));

import { isEventRegistrationOpen } from "@/lib/schedules/registration-open.server";

describe("isEventRegistrationOpen", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("is open while any schedule of the event takes inscriptions", async () => {
    findSchedules.mockResolvedValue([{ id: "schedule_open" }]);

    await expect(isEventRegistrationOpen("event_1")).resolves.toBe(true);
  });

  test("is closed when the event has no open schedule, and when it has none at all", async () => {
    findSchedules.mockResolvedValue([]);

    await expect(isEventRegistrationOpen("event_1")).resolves.toBe(false);
  });

  test("reads no schedule without an event", async () => {
    await expect(isEventRegistrationOpen(null)).resolves.toBe(false);

    expect(findSchedules).not.toHaveBeenCalled();
  });
});

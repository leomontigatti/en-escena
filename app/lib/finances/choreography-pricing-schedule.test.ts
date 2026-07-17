import { describe, expect, test } from "vitest";

import { resolveChoreographyPricingScheduleId } from "./choreography-pricing-schedule";

describe("resolveChoreographyPricingScheduleId", () => {
  test("prefers the schedule of the assigned capacity", () => {
    expect(
      resolveChoreographyPricingScheduleId({
        scheduleCapacityScheduleId: "capacity-schedule",
        choreographyScheduleId: "own-schedule",
      }),
    ).toBe("capacity-schedule");
  });

  test("falls back to the choreography's own schedule when there is no capacity", () => {
    expect(
      resolveChoreographyPricingScheduleId({
        scheduleCapacityScheduleId: null,
        choreographyScheduleId: "own-schedule",
      }),
    ).toBe("own-schedule");
  });

  test("is null when the choreography has no schedule at all", () => {
    expect(
      resolveChoreographyPricingScheduleId({
        scheduleCapacityScheduleId: null,
        choreographyScheduleId: null,
      }),
    ).toBeNull();
  });
});

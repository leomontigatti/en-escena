import { describe, expect, test } from "vitest";

import { selectPresetPriceOptions, type PresetPriceOption } from "./presets";

/**
 * The picker has to apply the writer's rule (`loadCandidatePriceRow`): a price
 * bound to a schedule other than the choreography's is refused, so offering it
 * is offering a guaranteed refusal.
 */
describe("selectPresetPriceOptions", () => {
  const general = priceOptionFixture({ id: "general", scheduleId: null });
  const boundToFirst = priceOptionFixture({
    id: "first",
    scheduleId: "schedule_1",
  });
  const boundToSecond = priceOptionFixture({
    id: "second",
    scheduleId: "schedule_2",
  });
  const options = [general, boundToFirst, boundToSecond];

  test("offers the general rows and the ones bound to the selection's schedule", () => {
    expect(
      selectPresetPriceOptions({
        options,
        scheduleIds: ["schedule_1", "schedule_1"],
      }),
    ).toEqual([general, boundToFirst]);
  });

  test("offers only the general rows when the selection spans two schedules", () => {
    expect(
      selectPresetPriceOptions({
        options,
        scheduleIds: ["schedule_1", "schedule_2"],
      }),
    ).toEqual([general]);
  });

  test("offers only the general rows to a choreography with no schedule", () => {
    expect(selectPresetPriceOptions({ options, scheduleIds: [null] })).toEqual([
      general,
    ]);
  });
});

function priceOptionFixture(
  overrides: Partial<PresetPriceOption> = {},
): PresetPriceOption {
  return {
    amount: 10000,
    id: "price",
    name: "Precio",
    paymentDeadline: null,
    scheduleId: null,
    ...overrides,
  };
}

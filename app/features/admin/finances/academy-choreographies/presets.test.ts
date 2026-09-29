import { describe, expect, test } from "vitest";

import { selectPresetPriceOptions, type PresetPriceOption } from "./presets";

/**
 * The picker has to apply the writer's rule (`loadCandidatePriceRow`): a price
 * bound to a schedule other than the choreography's is refused, so offering it
 * is offering a guaranteed refusal.
 */
describe("selectPresetPriceOptions", () => {
  const general = priceOptionFixture({ id: "general", scheduleIds: [] });
  const boundToFirst = priceOptionFixture({
    id: "first",
    scheduleIds: ["schedule_1"],
  });
  const boundToSecond = priceOptionFixture({
    id: "second",
    scheduleIds: ["schedule_2"],
  });
  const boundToBoth = priceOptionFixture({
    id: "both",
    scheduleIds: ["schedule_1", "schedule_2"],
  });
  const options = [general, boundToFirst, boundToSecond, boundToBoth];

  test("offers the general rows and the ones bound to the selection's schedule", () => {
    expect(
      selectPresetPriceOptions({
        options,
        scheduleIds: ["schedule_1", "schedule_1"],
      }),
    ).toEqual([general, boundToFirst, boundToBoth]);
  });

  test("offers the general rows and the ones covering every schedule of the selection", () => {
    expect(
      selectPresetPriceOptions({
        options,
        scheduleIds: ["schedule_1", "schedule_2"],
      }),
    ).toEqual([general, boundToBoth]);
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
    depositAmount: 3000,
    id: "price",
    name: "Precio",
    paymentDeadline: null,
    scheduleIds: [],
    ...overrides,
  };
}

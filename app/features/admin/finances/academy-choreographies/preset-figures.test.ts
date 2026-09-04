import { describe, expect, test } from "vitest";

import {
  resolveCurrentPriceId,
  sumPresetOwedAmount,
  type PresetInscription,
} from "./preset-figures";
import type { PresetPriceOption } from "./presets";

const groupTypeByChoreography = { choreography_1: "solo" };

describe("sumPresetOwedAmount", () => {
  test("sums what the loader already derived when nothing is picked", () => {
    expect(
      sumPresetOwedAmount({
        groupTypeByChoreography,
        inscriptions: [
          inscriptionFixture({ id: "inscription_1" }),
          inscriptionFixture({ id: "inscription_2" }),
        ],
        pickedPriceByGroupType: {},
        stage: "deposit",
      }),
    ).toEqual({ amount: 6000, status: "complete" });
  });

  test("re-prices the inscriptions the pick reaches", () => {
    expect(
      sumPresetOwedAmount({
        groupTypeByChoreography,
        inscriptions: [inscriptionFixture({ id: "inscription_1" })],
        pickedPriceByGroupType: { solo: priceFixture() },
        stage: "deposit",
      }),
    ).toEqual({ amount: 6000, status: "complete" });
  });

  test("takes the money already on an inscription off the re-priced figure", () => {
    expect(
      sumPresetOwedAmount({
        groupTypeByChoreography,
        // Below its deposit, so the pick still reaches it: only the crossing
        // fixes a price, and 1000 against a deposit of 3000 has not crossed.
        inscriptions: [
          inscriptionFixture({
            allocatedAmount: 1000,
            id: "inscription_1",
            owedDepositAmount: 2000,
          }),
        ],
        pickedPriceByGroupType: { solo: priceFixture() },
        stage: "deposit",
      }),
    ).toEqual({ amount: 5000, status: "complete" });
  });

  /**
   * The lock the crossing puts on a price, read here rather than only enforced
   * on write: a figure that moved for a row the writer is going to skip would
   * name an amount the confirm cannot produce.
   */
  test("leaves an inscription that already covered its deposit on its own price", () => {
    expect(
      sumPresetOwedAmount({
        groupTypeByChoreography,
        inscriptions: [
          inscriptionFixture({
            allocatedAmount: 3000,
            id: "inscription_1",
            owedBalanceAmount: 7000,
            owedDepositAmount: 0,
          }),
        ],
        pickedPriceByGroupType: { solo: priceFixture() },
        stage: "balance",
      }),
    ).toEqual({ amount: 7000, status: "complete" });
  });

  test("leaves a withdrawn inscription out of the re-pricing", () => {
    expect(
      sumPresetOwedAmount({
        groupTypeByChoreography,
        inscriptions: [
          inscriptionFixture({
            id: "inscription_1",
            owedBalanceAmount: 0,
            owedDepositAmount: 0,
            withdrawn: true,
          }),
        ],
        pickedPriceByGroupType: { solo: priceFixture() },
        stage: "deposit",
      }),
    ).toEqual({ amount: 0, status: "complete" });
  });

  /**
   * The alert under the figure promises that picking a price completes it. It
   * is the same promise as the writer's: an inscription with no applicable price
   * has nothing fixed on it, so a pick is exactly what gives it a threshold.
   */
  test("completes a figure left incomplete by an inscription with no price", () => {
    const unpriced = inscriptionFixture({
      basePriceAmount: null,
      basePriceId: null,
      depositAmount: null,
      id: "inscription_1",
      owedBalanceAmount: null,
      owedDepositAmount: null,
    });

    expect(
      sumPresetOwedAmount({
        groupTypeByChoreography,
        inscriptions: [unpriced],
        pickedPriceByGroupType: {},
        stage: "deposit",
      }),
    ).toEqual({ amount: 0, missingPriceCount: 1, status: "incomplete" });

    expect(
      sumPresetOwedAmount({
        groupTypeByChoreography,
        inscriptions: [unpriced],
        pickedPriceByGroupType: { solo: priceFixture() },
        stage: "deposit",
      }),
    ).toEqual({ amount: 6000, status: "complete" });
  });

  test("applies the pick only to the group type it was made for", () => {
    expect(
      sumPresetOwedAmount({
        groupTypeByChoreography: {
          choreography_1: "solo",
          choreography_2: "grupal",
        },
        inscriptions: [
          inscriptionFixture({ id: "inscription_1" }),
          inscriptionFixture({
            choreographyId: "choreography_2",
            id: "inscription_2",
          }),
        ],
        pickedPriceByGroupType: { solo: priceFixture() },
        stage: "deposit",
      }),
    ).toEqual({ amount: 9000, status: "complete" });
  });
});

describe("resolveCurrentPriceId", () => {
  const currentPrice = priceFixture({
    amount: 10000,
    depositAmount: 3000,
    id: "price_1",
    name: "Primera fecha",
  });

  test("opens on the row the inscriptions it would reach are on today", () => {
    expect(
      resolveCurrentPriceId({
        inscriptions: [
          inscriptionFixture({ id: "inscription_1" }),
          inscriptionFixture({ id: "inscription_2" }),
        ],
        options: [currentPrice, priceFixture()],
      }),
    ).toBe("price_1");
  });

  /**
   * The crossing fixed that row and a pick cannot move it, so letting it break
   * the agreement would empty a picker it is not even affected by.
   */
  test("ignores an inscription whose deposit is already covered", () => {
    expect(
      resolveCurrentPriceId({
        inscriptions: [
          inscriptionFixture({
            allocatedAmount: 3000,
            basePriceId: "price_old",
            id: "inscription_1",
          }),
          inscriptionFixture({ id: "inscription_2" }),
        ],
        options: [currentPrice],
      }),
    ).toBe("price_1");
  });

  test("opens empty when they are on different rows", () => {
    expect(
      resolveCurrentPriceId({
        inscriptions: [
          inscriptionFixture({ id: "inscription_1" }),
          inscriptionFixture({ basePriceId: "price_2", id: "inscription_2" }),
        ],
        options: [currentPrice, priceFixture()],
      }),
    ).toBeNull();
  });

  /**
   * A selection spanning schedules is only offered the general rows, so the row
   * in force can be one the picker cannot show. Opening on nothing is what keeps
   * it from claiming to hold a value it does not have.
   */
  test("opens empty when the row in force is not on offer", () => {
    expect(
      resolveCurrentPriceId({
        inscriptions: [inscriptionFixture({ id: "inscription_1" })],
        options: [priceFixture()],
      }),
    ).toBeNull();
  });

  test("opens empty when no price applies", () => {
    expect(
      resolveCurrentPriceId({
        inscriptions: [
          inscriptionFixture({ basePriceId: null, id: "inscription_1" }),
        ],
        options: [currentPrice],
      }),
    ).toBeNull();
  });

  test("opens empty when a pick would reach nothing", () => {
    expect(
      resolveCurrentPriceId({
        inscriptions: [
          inscriptionFixture({ id: "inscription_1", withdrawn: true }),
        ],
        options: [currentPrice],
      }),
    ).toBeNull();
  });
});

function inscriptionFixture(
  overrides: Partial<PresetInscription> & { id: string },
): PresetInscription {
  return {
    allocatedAmount: 0,
    basePriceAmount: 10000,
    basePriceId: "price_1",
    choreographyId: "choreography_1",
    dancerDiscountAmount: 0,
    depositAmount: 3000,
    owedBalanceAmount: 10000,
    owedDepositAmount: 3000,
    withdrawn: false,
    ...overrides,
  };
}

function priceFixture(
  overrides: Partial<PresetPriceOption> = {},
): PresetPriceOption {
  return {
    amount: 20000,
    depositAmount: 6000,
    id: "price_2",
    name: "Segunda fecha",
    paymentDeadline: null,
    scheduleId: null,
    ...overrides,
  };
}

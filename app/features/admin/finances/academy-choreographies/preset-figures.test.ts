import { describe, expect, test } from "vitest";

import {
  formatKeepCurrentPriceLabel,
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

describe("formatKeepCurrentPriceLabel", () => {
  test("names the row the inscriptions share", () => {
    expect(
      formatKeepCurrentPriceLabel({
        inscriptions: [
          inscriptionFixture({ id: "inscription_1" }),
          inscriptionFixture({ id: "inscription_2" }),
        ],
        options: [priceFixture({ id: "price_1", name: "Primera fecha" })],
      }),
    ).toBe("Mantener el precio actual · Primera fecha · $ 20.000");
  });

  /**
   * A selection spanning schedules is only offered the general rows, so the row
   * in force may not be among them. The amount is still the same for all of
   * them, and it is the figure the reader is comparing by.
   */
  test("falls back to the amount when the row is not on offer", () => {
    expect(
      formatKeepCurrentPriceLabel({
        inscriptions: [inscriptionFixture({ id: "inscription_1" })],
        options: [priceFixture({ id: "price_general" })],
      }),
    ).toBe("Mantener el precio actual · $ 10.000");
  });

  test("says nothing more when the inscriptions are on different prices", () => {
    expect(
      formatKeepCurrentPriceLabel({
        inscriptions: [
          inscriptionFixture({ id: "inscription_1" }),
          inscriptionFixture({
            basePriceAmount: 12000,
            basePriceId: "price_2",
            id: "inscription_2",
          }),
        ],
        options: [],
      }),
    ).toBe("Mantener el precio actual");
  });

  test("says nothing more when no price applies", () => {
    expect(
      formatKeepCurrentPriceLabel({
        inscriptions: [
          inscriptionFixture({
            basePriceAmount: null,
            basePriceId: null,
            id: "inscription_1",
          }),
        ],
        options: [],
      }),
    ).toBe("Mantener el precio actual");
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

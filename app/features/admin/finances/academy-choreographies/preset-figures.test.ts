import { describe, expect, test } from "vitest";

import {
  hasRePriceableInscription,
  resolveCurrentPriceId,
  sumPresetOwedAmount,
  type PresetInscription,
} from "./preset-figures";
import type { PresetPriceOption } from "./presets";

const groupTypeByChoreography = { choreography_1: "solo" };

/** Holds a row of deposit 3000 under today's cheaper row of deposit 2400. */
const belowStoredDeposit = inscriptionFixture({
  allocatedAmount: 2500,
  basePriceAmount: 8000,
  basePriceId: "price_today",
  id: "inscription_1",
  owedBalanceAmount: 5500,
  owedDepositAmount: 0,
});

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
        requiredDepositPercentage: 30,
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
        requiredDepositPercentage: 30,
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
        requiredDepositPercentage: 30,
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
        requiredDepositPercentage: 30,
        stage: "balance",
      }),
    ).toEqual({ amount: 7000, status: "complete" });
  });

  /**
   * The list moved down under money: 2500 passes today's deposit of 2400 and
   * not the 3000 of the row it stores, and the stored one is what fixes a price.
   */
  test.each([
    { expected: 3500, stage: "deposit" as const },
    { expected: 17500, stage: "balance" as const },
  ])(
    "re-prices below the stored deposit what passes today's, on $stage",
    ({ expected, stage }) => {
      expect(
        sumPresetOwedAmount({
          groupTypeByChoreography,
          inscriptions: [belowStoredDeposit],
          pickedPriceByGroupType: { solo: priceFixture() },
          requiredDepositPercentage: 30,
          stage,
        }),
      ).toEqual({ amount: expected, status: "complete" });
    },
  );

  test("charges the live discount off the picked total", () => {
    expect(
      sumPresetOwedAmount({
        groupTypeByChoreography,
        inscriptions: [
          inscriptionFixture({
            dancerDiscountAmount: 1000,
            id: "inscription_1",
          }),
        ],
        pickedPriceByGroupType: { solo: priceFixture() },
        requiredDepositPercentage: 30,
        stage: "balance",
      }),
    ).toEqual({ amount: 19000, status: "complete" });
  });

  // Only money crosses a deposit, so the write still moves a peso on one that
  // rounds to zero, and the figure has to name it.
  test("owes the peso that crosses a deposit rounding to zero", () => {
    expect(
      sumPresetOwedAmount({
        groupTypeByChoreography,
        inscriptions: [inscriptionFixture({ id: "inscription_1" })],
        pickedPriceByGroupType: { solo: priceFixture({ amount: 4 }) },
        requiredDepositPercentage: 10,
        stage: "deposit",
      }),
    ).toEqual({ amount: 1, status: "complete" });
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
        requiredDepositPercentage: 30,
        stage: "deposit",
      }),
    ).toEqual({ amount: 0, status: "complete" });
  });

  test("leaves a waived inscription out of the re-pricing", () => {
    expect(
      sumPresetOwedAmount({
        groupTypeByChoreography,
        inscriptions: [
          inscriptionFixture({
            financialStatus: "waived",
            id: "inscription_1",
            owedBalanceAmount: 0,
            owedDepositAmount: 0,
          }),
        ],
        pickedPriceByGroupType: { solo: priceFixture() },
        requiredDepositPercentage: 30,
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
      id: "inscription_1",
      owedBalanceAmount: null,
      owedDepositAmount: null,
      storedDepositAmount: null,
    });

    expect(
      sumPresetOwedAmount({
        groupTypeByChoreography,
        inscriptions: [unpriced],
        pickedPriceByGroupType: {},
        requiredDepositPercentage: 30,
        stage: "deposit",
      }),
    ).toEqual({ amount: 0, missingPriceCount: 1, status: "incomplete" });

    expect(
      sumPresetOwedAmount({
        groupTypeByChoreography,
        inscriptions: [unpriced],
        pickedPriceByGroupType: { solo: priceFixture() },
        requiredDepositPercentage: 30,
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
        requiredDepositPercentage: 30,
        stage: "deposit",
      }),
    ).toEqual({ amount: 9000, status: "complete" });
  });
});

describe("hasRePriceableInscription", () => {
  test("is true while one inscription is still short of its deposit", () => {
    expect(
      hasRePriceableInscription([
        inscriptionFixture({ allocatedAmount: 3000, id: "covered" }),
        inscriptionFixture({ allocatedAmount: 500, id: "short" }),
      ]),
    ).toBe(true);
  });

  // The crossing is what fixes the price, so a selection past it has nothing a
  // pick could reach and the dialog stops asking.
  test("is false once every inscription has covered its deposit", () => {
    expect(
      hasRePriceableInscription([
        inscriptionFixture({ allocatedAmount: 3000, id: "one" }),
        inscriptionFixture({ allocatedAmount: 9000, id: "two" }),
      ]),
    ).toBe(false);
  });

  test("is true below the stored deposit, past today's as it may be", () => {
    expect(hasRePriceableInscription([belowStoredDeposit])).toBe(true);
  });

  test("is true with money on a row that stores no price", () => {
    expect(
      hasRePriceableInscription([
        inscriptionFixture({
          allocatedAmount: 9000,
          id: "unstored",
          storedDepositAmount: null,
        }),
      ]),
    ).toBe(true);
  });

  test("is false for a roster of withdrawn inscriptions, unpaid as they are", () => {
    expect(
      hasRePriceableInscription([
        inscriptionFixture({ id: "gone", withdrawn: true }),
      ]),
    ).toBe(false);
  });

  test("is false for no inscriptions at all", () => {
    expect(hasRePriceableInscription([])).toBe(false);
  });
});

describe("resolveCurrentPriceId", () => {
  const currentPrice = priceFixture({
    amount: 10000,
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

  test("opens on today's row for money below the stored deposit", () => {
    expect(
      resolveCurrentPriceId({
        inscriptions: [belowStoredDeposit],
        options: [priceFixture({ amount: 8000, id: "price_today" })],
      }),
    ).toBe("price_today");
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
    financialStatus: "depositPending",
    choreographyId: "choreography_1",
    dancerDiscountAmount: 0,
    owedBalanceAmount: 10000,
    owedDepositAmount: 3000,
    storedDepositAmount: 3000,
    withdrawn: false,
    ...overrides,
  };
}

function priceFixture(
  overrides: Partial<PresetPriceOption> = {},
): PresetPriceOption {
  return {
    amount: 20000,
    id: "price_2",
    name: "Segunda fecha",
    paymentDeadline: null,
    scheduleIds: [],
    ...overrides,
  };
}

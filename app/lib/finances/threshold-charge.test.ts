import { describe, expect, test } from "vitest";

import { planThresholdCharge } from "@/lib/finances/threshold-charge";

/** A 10000 row at a 30 % deposit, the shape most of the table starts from. */
const base = {
  allocatedAmount: 0,
  covered: false,
  priceRow: { amount: 10000 },
  requiredDepositPercentage: 30,
};

describe("planThresholdCharge", () => {
  test.each([
    {
      name: "a held row, deposit stage",
      input: { ...base, stage: "deposit" },
      plan: { crossesDeposit: true, moves: [3000], owedAmount: 3000 },
    },
    {
      name: "a held row funds up to its deposit, then the rest",
      input: { ...base, stage: "balance" },
      plan: { crossesDeposit: true, moves: [3000, 7000], owedAmount: 10000 },
    },
    {
      name: "a row of the other cell, replaced by today's, with money on it",
      input: {
        ...base,
        allocatedAmount: 1000,
        priceRow: { amount: 8000 },
        stage: "balance",
      },
      plan: { crossesDeposit: true, moves: [1400, 5600], owedAmount: 7000 },
    },
    {
      name: "no row owes nothing computable and has nothing to move",
      input: { ...base, priceRow: null, stage: "balance" },
      plan: { crossesDeposit: false, moves: [], owedAmount: null },
    },
    {
      name: "a row cheaper than the effective one is what the money crosses",
      input: {
        ...base,
        allocatedAmount: 2400,
        priceRow: { amount: 8000 },
        stage: "deposit",
      },
      plan: { crossesDeposit: true, moves: [], owedAmount: 0 },
    },
    {
      name: "a row dearer than the effective one owes up to its own deposit",
      input: {
        ...base,
        allocatedAmount: 3000,
        priceRow: { amount: 12000 },
        stage: "deposit",
      },
      plan: { crossesDeposit: true, moves: [600], owedAmount: 600 },
    },
    {
      name: "a row already covered takes the rest in one move",
      input: {
        ...base,
        allocatedAmount: 4000,
        covered: true,
        stage: "balance",
      },
      plan: { crossesDeposit: false, moves: [6000], owedAmount: 6000 },
    },
    {
      name: "a row already covered owes no deposit",
      input: {
        ...base,
        allocatedAmount: 4000,
        covered: true,
        stage: "deposit",
      },
      plan: { crossesDeposit: false, moves: [], owedAmount: 0 },
    },
    {
      name: "one peso short of the deposit is a crossing move of one peso",
      input: { ...base, allocatedAmount: 2999, stage: "balance" },
      plan: { crossesDeposit: true, moves: [1, 7000], owedAmount: 7001 },
    },
    {
      name: "money exactly on the deposit crosses with no deposit move",
      input: { ...base, allocatedAmount: 3000, stage: "balance" },
      plan: { crossesDeposit: true, moves: [7000], owedAmount: 7000 },
    },
    {
      name: "money exactly on the deposit moves nothing at the deposit stage",
      input: { ...base, allocatedAmount: 3000, stage: "deposit" },
      plan: { crossesDeposit: true, moves: [], owedAmount: 0 },
    },
    {
      name: "a deposit equal to the total is one move",
      input: { ...base, requiredDepositPercentage: 100, stage: "balance" },
      plan: { crossesDeposit: true, moves: [10000], owedAmount: 10000 },
    },
    {
      name: "a deposit that rounds to zero takes a peso at the deposit stage",
      input: {
        ...base,
        priceRow: { amount: 4 },
        requiredDepositPercentage: 10,
        stage: "deposit",
      },
      plan: { crossesDeposit: true, moves: [1], owedAmount: 1 },
    },
    {
      name: "a deposit that rounds to zero crosses on a peso, then the rest",
      input: {
        ...base,
        priceRow: { amount: 4 },
        requiredDepositPercentage: 10,
        stage: "balance",
      },
      plan: { crossesDeposit: true, moves: [1, 3], owedAmount: 4 },
    },
    {
      name: "the peso of a zero deposit is not owed twice",
      input: {
        ...base,
        allocatedAmount: 1,
        covered: true,
        priceRow: { amount: 4 },
        requiredDepositPercentage: 10,
        stage: "deposit",
      },
      plan: { crossesDeposit: false, moves: [], owedAmount: 0 },
    },
    {
      name: "the discount comes off the total and never off the deposit",
      input: { ...base, dancerDiscountAmount: 1000, stage: "balance" },
      plan: { crossesDeposit: true, moves: [3000, 6000], owedAmount: 9000 },
    },
    {
      name: "a deposit above the discounted total is not reached by the charge",
      input: {
        ...base,
        dancerDiscountAmount: 1000,
        requiredDepositPercentage: 100,
        stage: "balance",
      },
      plan: { crossesDeposit: false, moves: [9000], owedAmount: 9000 },
    },
  ] as const)("$name", ({ input, plan }) => {
    expect(planThresholdCharge(input)).toEqual({
      ...plan,
      overAllocatedAmount: 0,
    });
  });

  test("answers what the row holds past the total it prices with", () => {
    expect(
      planThresholdCharge({
        ...base,
        allocatedAmount: 6000,
        priceRow: { amount: 5000 },
        stage: "balance",
      }),
    ).toEqual({
      crossesDeposit: true,
      moves: [],
      overAllocatedAmount: 1000,
      owedAmount: 0,
    });
  });
});

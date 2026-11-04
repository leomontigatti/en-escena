import { describe, expect, test } from "vitest";

import {
  paymentChangeUncoversRefunds,
  splitAvailableBalance,
} from "@/lib/finances/available-balance.server";

/** Payments numbered from 1 in the order given, with what each has allocated. */
function poolPayments(...entries: Array<[amount: number, allocated: number]>) {
  return entries.map(([amount, allocatedAmount], index) => ({
    allocatedAmount,
    amount,
    paymentId: `payment-${index + 1}`,
    paymentNumber: index + 1,
  }));
}

function availableByPayment(split: ReturnType<typeof splitAvailableBalance>) {
  return split.payments.map((payment) => [
    payment.paymentNumber,
    payment.paymentAvailableAmount,
  ]);
}

describe("splitAvailableBalance", () => {
  test("with no refunds, each payment keeps its free money and the pool is their sum", () => {
    const split = splitAvailableBalance({
      payments: poolPayments([1000, 1000], [2000, 500], [3000, 0]),
      refundedAmount: 0,
    });

    expect(availableByPayment(split)).toEqual([
      [1, 0],
      [2, 1500],
      [3, 3000],
    ]);
    expect(split.availableBalanceAmount).toBe(4500);
  });

  test("a refund within the newest payment's free money comes off that payment alone", () => {
    const split = splitAvailableBalance({
      payments: poolPayments([1000, 0], [2000, 0], [3000, 1000]),
      refundedAmount: 1500,
    });

    expect(availableByPayment(split)).toEqual([
      [1, 1000],
      [2, 2000],
      [3, 500],
    ]);
    expect(split.availableBalanceAmount).toBe(3500);
  });

  test("a refund larger than the newest payment's free money spills to the older ones", () => {
    const split = splitAvailableBalance({
      payments: poolPayments([1000, 0], [2000, 500], [3000, 1000]),
      refundedAmount: 3000,
    });

    expect(availableByPayment(split)).toEqual([
      [1, 1000],
      [2, 500],
      [3, 0],
    ]);
    expect(split.availableBalanceAmount).toBe(1500);
  });

  test("a fully allocated newest payment carries none of the refund", () => {
    const split = splitAvailableBalance({
      payments: poolPayments([1000, 0], [2000, 0], [3000, 3000]),
      refundedAmount: 1200,
    });

    expect(availableByPayment(split)).toEqual([
      [1, 1000],
      [2, 800],
      [3, 0],
    ]);
    expect(split.availableBalanceAmount).toBe(1800);
  });

  test("a refund equal to the pool leaves every payment at zero", () => {
    const split = splitAvailableBalance({
      payments: poolPayments([1000, 400], [2000, 500], [3000, 0]),
      refundedAmount: 5100,
    });

    expect(availableByPayment(split)).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(split.availableBalanceAmount).toBe(0);
  });

  test("draws by payment number, whatever order the payments arrive in", () => {
    const [first, second, third] = poolPayments([1000, 0], [2000, 0], [500, 0]);
    const split = splitAvailableBalance({
      payments: [second!, third!, first!],
      refundedAmount: 700,
    });

    expect(availableByPayment(split)).toEqual([
      [1, 1000],
      [2, 1800],
      [3, 0],
    ]);
  });
});

describe("paymentChangeUncoversRefunds", () => {
  // 3000 paid, 1000 allocated on the first payment, 1500 refunded: 500 left.
  const pool = {
    payments: poolPayments([2000, 1000], [1000, 0]),
    refundedAmount: 1500,
  };

  test("a payment leaving the pool uncovers the refunds its free money held", () => {
    expect(
      paymentChangeUncoversRefunds(pool, {
        nextAmount: null,
        paymentId: "payment-2",
      }),
    ).toBe(true);
  });

  test("a payment may leave while the rest of the pool still covers the refunds", () => {
    expect(
      paymentChangeUncoversRefunds(
        { ...pool, refundedAmount: 1000 },
        { nextAmount: null, paymentId: "payment-2" },
      ),
    ).toBe(false);
  });

  test("a deleted payment's allocations leave with it, so they free nothing", () => {
    // Without payment 1 the pool is 1000 (payment 2) against 1500 refunded.
    expect(
      paymentChangeUncoversRefunds(pool, {
        nextAmount: null,
        paymentId: "payment-1",
      }),
    ).toBe(true);
  });

  test("an amount cut is refused below the refunds and allowed down to them", () => {
    expect(
      paymentChangeUncoversRefunds(pool, {
        nextAmount: 499,
        paymentId: "payment-2",
      }),
    ).toBe(true);
    expect(
      paymentChangeUncoversRefunds(pool, {
        nextAmount: 500,
        paymentId: "payment-2",
      }),
    ).toBe(false);
  });

  test("with no refunds nothing is uncovered, whatever leaves", () => {
    expect(
      paymentChangeUncoversRefunds(
        { ...pool, refundedAmount: 0 },
        { nextAmount: null, paymentId: "payment-1" },
      ),
    ).toBe(false);
  });

  test("a change that does not lower the payment is never refused", () => {
    // A pool already short of its refunds: keeping or raising the amount does
    // not make it worse.
    const short = { ...pool, refundedAmount: 9000 };

    expect(
      paymentChangeUncoversRefunds(short, {
        nextAmount: 1000,
        paymentId: "payment-2",
      }),
    ).toBe(false);
    expect(
      paymentChangeUncoversRefunds(short, {
        nextAmount: 1200,
        paymentId: "payment-2",
      }),
    ).toBe(false);
  });
});

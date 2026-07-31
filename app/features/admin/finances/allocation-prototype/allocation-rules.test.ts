/**
 * THROWAWAY PROTOTYPE — the one part of #550 worth testing.
 *
 * The screens are throwaway, but these three rules are the *content* of the
 * decisions the ticket owes, so the prototype is pinned to them rather than to
 * whatever a keystroke happened to produce on screen.
 */
import { describe, expect, it } from "vitest";

import {
  readPriceLock,
  rejectAllocation,
  spreadFromPool,
} from "./allocation-rules";
import {
  initialPrototypeState,
  readInscriptions,
  readPayments,
  upsertAllocation,
} from "./fixtures";

function readPaymentsOf(payments: typeof initialPrototypeState.payments) {
  return readPayments({ ...initialPrototypeState, payments });
}

function read(state = initialPrototypeState) {
  const inscriptions = readInscriptions(state);
  const payments = readPayments(state);

  return {
    state,
    inscription: (id: string) => {
      const found = inscriptions.find((row) => row.id === id);
      if (found === undefined) {
        throw new Error(`no inscription ${id}`);
      }
      return found;
    },
    payment: (id: string) => {
      const found = payments.find((row) => row.id === id);
      if (found === undefined) {
        throw new Error(`no payment ${id}`);
      }
      return found;
    },
  };
}

describe("spreadFromPool", () => {
  it("fills from the oldest payment first, never by size or click order", () => {
    const payments = readPaymentsOf(read().state.payments);
    const oldest = payments.find((payment) => payment.number === 41);
    const amount = (oldest?.availableAmount ?? 0) + 1000;
    const slices = spreadFromPool(payments, amount);

    // #41 is drained before #47 is touched at all, and #52 is never reached.
    expect(slices.map((slice) => slice.paymentNumber)).toEqual([41, 47]);
    expect(slices[0].amount).toBe(oldest?.availableAmount);
    expect(slices[1].amount).toBe(1000);
  });

  it("takes it all from one payment when that payment covers it", () => {
    const slices = spreadFromPool(readPaymentsOf(read().state.payments), 1000);

    expect(slices).toHaveLength(1);
    expect(slices[0].paymentNumber).toBe(41);
  });
});

describe("rejectAllocation", () => {
  it("refuses to push an inscription past its total and names what it owes", () => {
    const world = read();
    const inscription = world.inscription("ins-2");

    expect(
      rejectAllocation({
        inscription,
        availableBalanceAmount: 1000000,
        amount: (inscription.owedBalanceAmount ?? 0) + 1,
      }),
    ).toMatchObject({ reason: "overAllocation" });

    expect(
      rejectAllocation({
        inscription,
        availableBalanceAmount: 1000000,
        amount: inscription.owedBalanceAmount ?? 0,
      }),
    ).toBeNull();
  });

  it("refuses an amount the academy's available balance cannot cover", () => {
    const world = read();

    expect(
      rejectAllocation({
        inscription: world.inscription("ins-8"),
        availableBalanceAmount: 500,
        amount: 501,
      }),
    ).toMatchObject({ reason: "insufficientBalance" });
  });

  it("refuses a zero or negative amount", () => {
    const world = read();

    expect(
      rejectAllocation({
        inscription: world.inscription("ins-8"),
        availableBalanceAmount: 500,
        amount: 0,
      }),
    ).toMatchObject({ reason: "notPositive" });
  });
});

describe("upsertAllocation", () => {
  it("reverts to the choreography's default price when the last allocation goes", () => {
    // Facundo Ledesma holds a single allocation and sits on `price-late`, while
    // his choreography's default is `price-regular`.
    const next = upsertAllocation(initialPrototypeState, {
      paymentId: "pay-2",
      inscriptionId: "ins-6",
      amount: 0,
    });

    expect(
      next.inscriptions.find((row) => row.id === "ins-6")?.selectedPriceId,
    ).toBe("price-regular");
  });

  it("keeps the price while any allocation survives", () => {
    // Camila Duarte holds two: removing one leaves the other standing.
    const next = upsertAllocation(initialPrototypeState, {
      paymentId: "pay-1",
      inscriptionId: "ins-3",
      amount: 0,
    });

    expect(
      next.inscriptions.find((row) => row.id === "ins-3")?.selectedPriceId,
    ).toBe("price-early");
  });
});

describe("readPriceLock", () => {
  it("leaves the price free while no money has landed", () => {
    expect(readPriceLock(read().inscription("ins-4"))).toMatchObject({
      isFirstPick: true,
      isLocked: false,
    });
  });

  it("locks the price as soon as an allocation exists", () => {
    const lock = readPriceLock(read().inscription("ins-1"));

    expect(lock.isLocked).toBe(true);
    expect(lock.lockedReason).not.toBeNull();
  });
});

/**
 * THROWAWAY PROTOTYPE — the one part of #550 worth testing.
 *
 * The screens are throwaway, but these three rules are the *content* of the
 * decisions the ticket owes, so the prototype is pinned to them rather than to
 * whatever a keystroke happened to produce on screen.
 */
import { describe, expect, it } from "vitest";

import {
  readMoneyDialogShape,
  readPriceLock,
  readSuggestedAmount,
  rejectAllocation,
  spreadFromPool,
  unwindToPool,
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

describe("readMoneyDialogShape", () => {
  it("offers only what the row admits", () => {
    const world = read();

    // Ana is over-allocated — her discount improved after she paid in full — so
    // the excess outranks her `Pagada` status.
    expect(readMoneyDialogShape(world.inscription("ins-1"))).toBe(
      "releaseExcess",
    );
    // Nadia is withdrawn and still funded: the same shape, for the same reason.
    expect(readMoneyDialogShape(world.inscription("ins-18"))).toBe(
      "releaseExcess",
    );
    // Bruno is short of his total, so the dialog is about adding money.
    expect(readMoneyDialogShape(world.inscription("ins-2"))).toBe("allocate");
  });

  it("empties a row that is settled to the peso", () => {
    // Julián owes nothing and holds no excess: nothing to add, everything to
    // remove.
    expect(readMoneyDialogShape(read().inscription("ins-10"))).toBe(
      "releaseAll",
    );
  });

  it("does not offer to remove nothing", () => {
    // A total of zero is reached by owing zero, so the row reads `Pagada` with
    // no money on it — and «Quitar $ 0» is not an act.
    const settled = upsertAllocation(initialPrototypeState, {
      paymentId: "pay-1",
      inscriptionId: "ins-10",
      amount: 0,
    });
    const priceless = {
      ...read(settled).inscription("ins-10"),
      totalAmount: 0,
      status: "paidInFull" as const,
    };

    expect(readMoneyDialogShape(priceless)).toBe("allocate");
  });
});

describe("readSuggestedAmount", () => {
  it("hints the seña while the threshold is unmet, the rest once it is met", () => {
    const world = read();
    const bruno = world.inscription("ins-2");

    // `Señada`: what is left to be fully paid.
    expect(readSuggestedAmount(bruno)).toBe(bruno.owedBalanceAmount);

    // `Seña pendiente` with no money: the whole seña, derived from the price
    // currently selected, so changing the price changes the hint.
    const ana = world.inscription("ins-11");
    expect(readSuggestedAmount(ana)).toBe(ana.depositAmount);
  });
});

describe("unwindToPool", () => {
  it("takes the money off newest first, the mirror of the fill rule", () => {
    // Camila's two allocations: pay-1 ($ 12.000) and pay-2 ($ 6.000). Removing
    // $ 8.000 empties the newer one and dips into the older, never the reverse.
    const camila = readInscriptions(initialPrototypeState).find(
      (row) => row.id === "ins-3",
    )!;
    const next = unwindToPool(
      camila.allocations,
      readPayments(initialPrototypeState),
      8000,
    );

    expect(next.find((row) => row.paymentId === "pay-2")?.amount).toBe(0);
    expect(next.find((row) => row.paymentId === "pay-1")?.amount).toBe(10000);
  });
});

describe("upsertAllocation", () => {
  it("writes nothing to the inscription when the last allocation goes", () => {
    // #553 amended #549 and #550: the price **lock** is keyed on money, so it
    // releases when the money leaves, but `selectedPriceId` keeps its last
    // value instead of reverting to the choreography's default. The reverted
    // value would never charge anyone — the price re-resolves on the next
    // allocation write — so writing it answered a question needing no answer.
    const next = upsertAllocation(initialPrototypeState, {
      paymentId: "pay-2",
      inscriptionId: "ins-6",
      amount: 0,
    });
    const inscription = next.inscriptions.find((row) => row.id === "ins-6");

    expect(inscription?.selectedPriceId).toBe("price-late");
    // And the lock is open again, which is the whole point of the gesture.
    expect(
      readPriceLock(readInscriptions(next).find((row) => row.id === "ins-6")!)
        .isLocked,
    ).toBe(false);
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
    // «Ecos» has no money on it at all: registered, never paid.
    expect(readPriceLock(read().inscription("ins-11"))).toMatchObject({
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

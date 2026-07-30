/**
 * THROWAWAY PROTOTYPE — the one part of #550 worth testing.
 *
 * The variants are throwaway, but these three rules are the *content* of the
 * decisions the ticket owes, so the prototype is pinned to them rather than to
 * whatever a keystroke happened to produce on screen.
 */
import { describe, expect, it } from "vitest";

import { rejectAllocation, readRepick } from "./allocation-rules";
import {
  initialPrototypeState,
  readInscriptions,
  readPayments,
  upsertAllocation,
} from "./fixtures";

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

describe("rejectAllocation", () => {
  it("refuses to push an inscription past its total and names what it owes", () => {
    const world = read();
    // Bruno Salas: total 46 800, allocated 20 000 of payment #41.
    const inscription = world.inscription("ins-2");

    expect(
      rejectAllocation({
        inscription,
        payment: world.payment("pay-1"),
        amount: (inscription.totalAmount ?? 0) + 1,
      }),
    ).toMatchObject({ reason: "overAllocation" });

    expect(
      rejectAllocation({
        inscription,
        payment: world.payment("pay-1"),
        amount: inscription.totalAmount ?? 0,
      }),
    ).toBeNull();
  });

  it("lets an already over-allocated inscription come down but not up", () => {
    // Ana Rivas is settled to the peso; drop her discount so the money already
    // on her exceeds the total, the passive excess #549 tolerates.
    const state = {
      ...initialPrototypeState,
      allocations: initialPrototypeState.allocations.map((allocation) =>
        allocation.inscriptionId === "ins-1"
          ? { ...allocation, amount: 60000 }
          : allocation,
      ),
    };
    const world = read(state);
    const inscription = world.inscription("ins-1");

    expect(inscription.excessAmount).toBeGreaterThan(0);
    expect(
      rejectAllocation({
        inscription,
        payment: world.payment("pay-1"),
        amount: 55000,
      }),
    ).toBeNull();
    expect(
      rejectAllocation({
        inscription,
        payment: world.payment("pay-1"),
        amount: 61000,
      }),
    ).toMatchObject({ reason: "overAllocation" });
  });

  it("refuses to over-draw a payment", () => {
    const world = read();
    const payment = world.payment("pay-3");

    expect(
      rejectAllocation({
        inscription: world.inscription("ins-8"),
        payment,
        amount: payment.availableAmount + 1,
      }),
    ).toMatchObject({ reason: "paymentOverdrawn" });
  });
});

describe("upsertAllocation", () => {
  it("clears the chosen price when the inscription runs out of allocations", () => {
    // Emilia Ponce holds a single allocation, of payment #41.
    const next = upsertAllocation(initialPrototypeState, {
      paymentId: "pay-1",
      inscriptionId: "ins-5",
      amount: 0,
    });

    expect(
      next.inscriptions.find((row) => row.id === "ins-5")?.selectedPriceId,
    ).toBeNull();
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

describe("readRepick", () => {
  it("leaves the first pick free under every policy", () => {
    const inscription = read().inscription("ins-4");

    for (const policy of ["free", "warn", "blocked"] as const) {
      expect(readRepick(inscription, policy)).toMatchObject({
        isFirstPick: true,
        canRepick: true,
      });
    }
  });

  it("blocks, warns or allows a second pick according to the policy", () => {
    const inscription = read().inscription("ins-1");

    expect(readRepick(inscription, "free")).toMatchObject({
      canRepick: true,
      warning: null,
    });
    expect(readRepick(inscription, "warn").warning).not.toBeNull();
    expect(readRepick(inscription, "blocked")).toMatchObject({
      canRepick: false,
    });
  });
});

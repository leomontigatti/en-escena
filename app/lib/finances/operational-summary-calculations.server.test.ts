import { describe, expect, test } from "vitest";

import {
  buildChoreographyOperationalFinanceRow,
  buildOperationalFinanceSummaryFromChoreographyRows,
  computeDancerDiscountAmounts,
  dancerDiscountPercentage,
  deriveChoreographyFinancialState,
  deriveChoreographyNeedsAttention,
  deriveInscriptionFinancialState,
  type FinanceChoreographyRow,
  type ResolvedInscription,
} from "./operational-summary-calculations.server";

const choreography: FinanceChoreographyRow = {
  academyId: "academy_1",
  choreographyScheduleId: null,
  groupType: "solo",
  id: "choreography_1",
  name: "Aire",
  scheduleCapacityScheduleId: null,
};

function resolvedInscription(
  overrides: Partial<ResolvedInscription> & { id: string },
): ResolvedInscription {
  return {
    balancePendingAmount: 0,
    basePriceAmount: 10000,
    choreographyId: "choreography_1",
    dancerDiscountAmount: 0,
    dancerId: "dancer_1",
    depositAmount: 3000,
    depositReferenceDate: null,
    finalPriceAmount: 10000,
    paidAmount: 0,
    state: "impaga",
    ...overrides,
  };
}

describe("deriveInscriptionFinancialState", () => {
  test("is impaga without a seña snapshot", () => {
    expect(
      deriveInscriptionFinancialState({
        depositReferenceDate: null,
        balanceReferenceDate: null,
      }),
    ).toBe("impaga");
  });

  test("is señada with a seña snapshot and no saldo snapshot", () => {
    expect(
      deriveInscriptionFinancialState({
        depositReferenceDate: "2026-03-21",
        balanceReferenceDate: null,
      }),
    ).toBe("señada");
  });

  test("is pagada with a saldo snapshot", () => {
    expect(
      deriveInscriptionFinancialState({
        depositReferenceDate: "2026-03-21",
        balanceReferenceDate: "2026-04-21",
      }),
    ).toBe("pagada");
  });
});

describe("deriveChoreographyFinancialState (marca de agua)", () => {
  test("is impaga when there are no inscriptions", () => {
    expect(deriveChoreographyFinancialState([])).toBe("impaga");
  });

  test("is impaga when every inscription is impaga", () => {
    expect(deriveChoreographyFinancialState(["impaga", "impaga"])).toBe(
      "impaga",
    );
  });

  test("stays señada with a mix of impaga and señada", () => {
    expect(deriveChoreographyFinancialState(["impaga", "señada"])).toBe(
      "señada",
    );
  });

  test("stays señada with a mix of señada and pagada", () => {
    expect(deriveChoreographyFinancialState(["señada", "pagada"])).toBe(
      "señada",
    );
  });

  test("is pagada only when every inscription is pagada", () => {
    expect(deriveChoreographyFinancialState(["pagada", "pagada"])).toBe(
      "pagada",
    );
  });
});

describe("deriveChoreographyNeedsAttention", () => {
  test("is false for a uniform roster", () => {
    expect(deriveChoreographyNeedsAttention(["señada", "señada"])).toBe(false);
    expect(deriveChoreographyNeedsAttention(["impaga"])).toBe(false);
    expect(deriveChoreographyNeedsAttention([])).toBe(false);
  });

  test("is true for a mixed roster", () => {
    expect(deriveChoreographyNeedsAttention(["señada", "impaga"])).toBe(true);
    expect(deriveChoreographyNeedsAttention(["pagada", "señada"])).toBe(true);
  });
});

describe("dancerDiscountPercentage", () => {
  test("gives no discount for 1 or 2 inscriptions", () => {
    expect(dancerDiscountPercentage(1)).toBe(0);
    expect(dancerDiscountPercentage(2)).toBe(0);
  });

  test("gives 10% for 3 inscriptions", () => {
    expect(dancerDiscountPercentage(3)).toBe(10);
  });

  test("gives 15% for 4 or more inscriptions", () => {
    expect(dancerDiscountPercentage(4)).toBe(15);
    expect(dancerDiscountPercentage(6)).toBe(15);
  });
});

describe("computeDancerDiscountAmounts", () => {
  test("leaves everyone without discount below the threshold", () => {
    const discounts = computeDancerDiscountAmounts([
      { id: "a", frozenBasePriceAmount: 10000 },
      { id: "b", frozenBasePriceAmount: 20000 },
    ]);

    expect(discounts.get("a")).toEqual({ amount: 0, percentage: 0 });
    expect(discounts.get("b")).toEqual({ amount: 0, percentage: 0 });
  });

  test("applies 10% to all but the most expensive inscription at 3", () => {
    const discounts = computeDancerDiscountAmounts([
      { id: "a", frozenBasePriceAmount: 10000 },
      { id: "b", frozenBasePriceAmount: 20000 },
      { id: "c", frozenBasePriceAmount: 15000 },
    ]);

    // The 20000 inscription is the "last" (most expensive) and keeps no discount.
    expect(discounts.get("b")).toEqual({ amount: 0, percentage: 0 });
    expect(discounts.get("a")).toEqual({ amount: 1000, percentage: 10 });
    expect(discounts.get("c")).toEqual({ amount: 1500, percentage: 10 });
  });

  test("applies 15% to all but the most expensive inscription at 4", () => {
    const discounts = computeDancerDiscountAmounts([
      { id: "a", frozenBasePriceAmount: 10000 },
      { id: "b", frozenBasePriceAmount: 20000 },
      { id: "c", frozenBasePriceAmount: 15000 },
      { id: "d", frozenBasePriceAmount: 12000 },
    ]);

    expect(discounts.get("b")).toEqual({ amount: 0, percentage: 0 });
    expect(discounts.get("a")).toEqual({ amount: 1500, percentage: 15 });
    expect(discounts.get("c")).toEqual({ amount: 2250, percentage: 15 });
    expect(discounts.get("d")).toEqual({ amount: 1800, percentage: 15 });
  });
});

describe("buildChoreographyOperationalFinanceRow", () => {
  test("owes the seña of impaga inscriptions as both seña and gross saldo", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          id: "i1",
          state: "impaga",
          basePriceAmount: 10000,
          depositAmount: 3000,
        }),
      ],
    });

    expect(row.financialState).toBe("impaga");
    expect(row.needsAttention).toBe(false);
    expect(row.depositAmount).toEqual({ amount: 3000, status: "complete" });
    expect(row.owedDepositAmount).toEqual({ amount: 3000, status: "complete" });
    expect(row.owedAmount).toEqual({ amount: 3000, status: "complete" });
    expect(row.registrationCount).toBe(1);
  });

  test("owes the pending saldo of señada inscriptions", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          id: "i1",
          state: "señada",
          basePriceAmount: 10000,
          depositAmount: 3000,
          balancePendingAmount: 7000,
          depositReferenceDate: "2026-03-21",
        }),
      ],
    });

    expect(row.financialState).toBe("señada");
    expect(row.depositCompletedOn).toBe("2026-03-21");
    expect(row.owedDepositAmount).toEqual({ amount: 0, status: "complete" });
    expect(row.owedAmount).toEqual({ amount: 7000, status: "complete" });
  });

  test("owes nothing on a fully pagada choreography", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          id: "i1",
          state: "pagada",
          basePriceAmount: 10000,
          depositAmount: 3000,
          paidAmount: 10000,
          depositReferenceDate: "2026-03-21",
        }),
      ],
    });

    expect(row.financialState).toBe("pagada");
    expect(row.owedAmount).toEqual({ amount: 0, status: "complete" });
    expect(row.paidAmount).toBe(10000);
  });

  test("marks a mixed roster as señada and needing attention", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          id: "i1",
          state: "señada",
          balancePendingAmount: 7000,
          depositReferenceDate: "2026-03-21",
        }),
        resolvedInscription({ id: "i2", state: "impaga", depositAmount: 3000 }),
      ],
    });

    expect(row.financialState).toBe("señada");
    expect(row.needsAttention).toBe(true);
    expect(row.owedAmount).toEqual({ amount: 10000, status: "complete" });
    expect(row.owedDepositAmount).toEqual({ amount: 3000, status: "complete" });
  });

  test("reports incomplete amounts when an impaga inscription has no price", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          id: "i1",
          state: "impaga",
          basePriceAmount: null,
          depositAmount: null,
        }),
      ],
    });

    expect(row.owedAmount).toEqual({
      amount: 0,
      missingPriceCount: 1,
      status: "incomplete",
    });
    expect(row.owedDepositAmount).toEqual({
      amount: 0,
      missingPriceCount: 1,
      status: "incomplete",
    });
  });
});

describe("buildOperationalFinanceSummaryFromChoreographyRows", () => {
  test("subtracts Saldo disponible from Saldo adeudado but not from Seña adeudada", () => {
    const rows = [
      buildChoreographyOperationalFinanceRow({
        choreography,
        inscriptions: [
          resolvedInscription({
            id: "i1",
            state: "impaga",
            basePriceAmount: 10000,
            depositAmount: 3000,
          }),
        ],
      }),
    ];

    const summary = buildOperationalFinanceSummaryFromChoreographyRows({
      availableBalanceAmount: 2000,
      choreographyFinanceRows: rows,
      totalPaidAmount: 2000,
    });

    // Seña adeudada does not discount Saldo disponible.
    expect(summary.owedDepositAmount).toEqual({
      amount: 3000,
      status: "complete",
    });
    // Saldo adeudado discounts Saldo disponible.
    expect(summary.owedAmount).toEqual({ amount: 1000, status: "complete" });
    expect(summary.availableBalanceAmount).toBe(2000);
    expect(summary.totalPaidAmount).toBe(2000);
  });

  test("never lets Saldo adeudado go below zero", () => {
    const rows = [
      buildChoreographyOperationalFinanceRow({
        choreography,
        inscriptions: [
          resolvedInscription({
            id: "i1",
            state: "impaga",
            basePriceAmount: 10000,
            depositAmount: 3000,
          }),
        ],
      }),
    ];

    const summary = buildOperationalFinanceSummaryFromChoreographyRows({
      availableBalanceAmount: 9000,
      choreographyFinanceRows: rows,
      totalPaidAmount: 9000,
    });

    expect(summary.owedAmount).toEqual({ amount: 0, status: "complete" });
  });
});

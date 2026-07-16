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
    balanceAmount: 7000,
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
  test("owes both the seña and the saldo of an impaga inscription", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          id: "i1",
          state: "impaga",
          basePriceAmount: 10000,
          depositAmount: 3000,
          balanceAmount: 7000,
        }),
      ],
    });

    expect(row.financialState).toBe("impaga");
    expect(row.needsAttention).toBe(false);
    expect(row.depositAmount).toEqual({ amount: 3000, status: "complete" });
    // La tarjeta Saldo suma el saldo de toda inscripción, tentativo o no.
    expect(row.balanceAmount).toEqual({ amount: 7000, status: "complete" });
    // Una coreografía registrada se adeuda completa: la impaga aporta su seña
    // a una deuda y su saldo a la otra.
    expect(row.owedDepositAmount).toEqual({ amount: 3000, status: "complete" });
    expect(row.owedBalanceAmount).toEqual({ amount: 7000, status: "complete" });
    expect(row.registrationCount).toBe(1);
  });

  test("owes the saldo of señada inscriptions and no seña", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          id: "i1",
          state: "señada",
          basePriceAmount: 10000,
          depositAmount: 3000,
          balanceAmount: 7000,
          depositReferenceDate: "2026-03-21",
        }),
      ],
    });

    expect(row.financialState).toBe("señada");
    expect(row.depositCompletedOn).toBe("2026-03-21");
    expect(row.balanceAmount).toEqual({ amount: 7000, status: "complete" });
    expect(row.owedDepositAmount).toEqual({ amount: 0, status: "complete" });
    expect(row.owedBalanceAmount).toEqual({ amount: 7000, status: "complete" });
  });

  test("still reports the saldo of a pagada choreography but owes nothing", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          id: "i1",
          state: "pagada",
          basePriceAmount: 10000,
          depositAmount: 3000,
          balanceAmount: 7000,
          paidAmount: 10000,
          depositReferenceDate: "2026-03-21",
        }),
      ],
    });

    expect(row.financialState).toBe("pagada");
    expect(row.balanceAmount).toEqual({ amount: 7000, status: "complete" });
    expect(row.owedDepositAmount).toEqual({ amount: 0, status: "complete" });
    expect(row.owedBalanceAmount).toEqual({ amount: 0, status: "complete" });
    expect(row.paidAmount).toBe(10000);
  });

  test("owes the saldo of every unpaid inscription across a mixed roster", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          id: "i1",
          state: "señada",
          balanceAmount: 7000,
          depositReferenceDate: "2026-03-21",
        }),
        resolvedInscription({
          id: "i2",
          state: "impaga",
          depositAmount: 3000,
          balanceAmount: 7000,
        }),
        resolvedInscription({
          id: "i3",
          state: "pagada",
          depositAmount: 3000,
          balanceAmount: 7000,
          depositReferenceDate: "2026-03-21",
        }),
      ],
    });

    expect(row.financialState).toBe("señada");
    expect(row.needsAttention).toBe(true);
    expect(row.balanceAmount).toEqual({ amount: 21000, status: "complete" });
    // Sólo la impaga adeuda seña.
    expect(row.owedDepositAmount).toEqual({ amount: 3000, status: "complete" });
    // Señada e impaga adeudan saldo; la pagada no.
    expect(row.owedBalanceAmount).toEqual({
      amount: 14000,
      status: "complete",
    });
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
          balanceAmount: null,
        }),
      ],
    });

    expect(row.basePriceAmount).toEqual({
      amount: 0,
      missingPriceCount: 1,
      status: "incomplete",
    });
    expect(row.balanceAmount).toEqual({
      amount: 0,
      missingPriceCount: 1,
      status: "incomplete",
    });
    expect(row.owedDepositAmount).toEqual({
      amount: 0,
      missingPriceCount: 1,
      status: "incomplete",
    });
    expect(row.owedBalanceAmount).toEqual({
      amount: 0,
      missingPriceCount: 1,
      status: "incomplete",
    });
  });
});

describe("buildOperationalFinanceSummaryFromChoreographyRows", () => {
  test("reports Seña adeudada gross, without discounting Saldo disponible", () => {
    const rows = [
      buildChoreographyOperationalFinanceRow({
        choreography,
        inscriptions: [
          resolvedInscription({
            id: "i1",
            state: "impaga",
            basePriceAmount: 10000,
            depositAmount: 3000,
            balanceAmount: 7000,
          }),
        ],
      }),
    ];

    const summary = buildOperationalFinanceSummaryFromChoreographyRows({
      availableBalanceAmount: 2000,
      choreographyFinanceRows: rows,
      totalPaidAmount: 2000,
    });

    expect(summary.owedDepositAmount).toEqual({
      amount: 3000,
      status: "complete",
    });
    expect(summary.owedBalanceAmount).toEqual({
      amount: 7000,
      status: "complete",
    });
    expect(summary.availableBalanceAmount).toBe(2000);
    expect(summary.totalPaidAmount).toBe(2000);
  });

  test("reports Saldo adeudado gross, without discounting Saldo disponible", () => {
    const rows = [
      buildChoreographyOperationalFinanceRow({
        choreography,
        inscriptions: [
          resolvedInscription({
            id: "i1",
            state: "señada",
            basePriceAmount: 10000,
            depositAmount: 3000,
            balanceAmount: 7000,
            depositReferenceDate: "2026-03-21",
          }),
        ],
      }),
    ];

    const summary = buildOperationalFinanceSummaryFromChoreographyRows({
      availableBalanceAmount: 9000,
      choreographyFinanceRows: rows,
      totalPaidAmount: 9000,
    });

    // Bruto: el disponible está a la vista al lado y no se descuenta acá.
    expect(summary.owedBalanceAmount).toEqual({
      amount: 7000,
      status: "complete",
    });
    expect(summary.owedDepositAmount).toEqual({
      amount: 0,
      status: "complete",
    });
  });

  test("owes the saldo of every unpaid inscription and the seña of the impagas", () => {
    const rows = [
      buildChoreographyOperationalFinanceRow({
        choreography,
        inscriptions: [
          resolvedInscription({
            id: "i1",
            state: "impaga",
            depositAmount: 3000,
            balanceAmount: 7000,
          }),
          resolvedInscription({
            id: "i2",
            state: "señada",
            depositAmount: 3000,
            balanceAmount: 7000,
            depositReferenceDate: "2026-03-21",
          }),
          resolvedInscription({
            id: "i3",
            state: "pagada",
            depositAmount: 3000,
            balanceAmount: 7000,
            depositReferenceDate: "2026-03-21",
          }),
        ],
      }),
    ];

    const summary = buildOperationalFinanceSummaryFromChoreographyRows({
      availableBalanceAmount: 0,
      choreographyFinanceRows: rows,
      totalPaidAmount: 0,
    });

    // Seña: sólo la impaga. Saldo: la impaga y la señada, no la pagada. La
    // impaga cuenta en las dos.
    expect(summary.owedDepositAmount).toEqual({
      amount: 3000,
      status: "complete",
    });
    expect(summary.owedBalanceAmount).toEqual({
      amount: 14000,
      status: "complete",
    });
  });
});

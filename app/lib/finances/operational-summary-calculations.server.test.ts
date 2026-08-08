import { describe, expect, test } from "vitest";

import {
  buildChoreographyOperationalFinanceRow,
  buildOperationalFinanceSummaryFromChoreographyRows,
  computeDancerDiscountAmounts,
  dancerDiscountPercentage,
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

/**
 * Una inscripción de precio 10000 y seña 3000, sin dinero. Los tests mueven
 * `allocatedAmount` y dejan que las cifras se deriven, como en producción.
 */
function resolvedInscription(
  overrides: Partial<ResolvedInscription> & { id: string },
): ResolvedInscription {
  const base: ResolvedInscription = {
    allocatedAmount: 0,
    anomalies: [],
    basePriceAmount: 10000,
    choreographyId: "choreography_1",
    dancerDiscountAmount: 0,
    dancerId: "dancer_1",
    depositAmount: 3000,
    financialStatus: "depositPending",
    id: overrides.id,
    overAllocatedAmount: 0,
    owedBalanceAmount: 10000,
    owedDepositAmount: 3000,
    totalAmount: 10000,
    withdrawn: false,
  };

  return { ...base, ...overrides };
}

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
      { id: "a", priceAmount: 10000 },
      { id: "b", priceAmount: 20000 },
    ]);

    expect(discounts.get("a")).toEqual({ amount: 0, percentage: 0 });
    expect(discounts.get("b")).toEqual({ amount: 0, percentage: 0 });
  });

  test("applies 10% to all but the most expensive inscription at 3", () => {
    const discounts = computeDancerDiscountAmounts([
      { id: "a", priceAmount: 10000 },
      { id: "b", priceAmount: 20000 },
      { id: "c", priceAmount: 15000 },
    ]);

    // The 20000 inscription is the "last" (most expensive) and keeps no discount.
    expect(discounts.get("b")).toEqual({ amount: 0, percentage: 0 });
    expect(discounts.get("a")).toEqual({ amount: 1000, percentage: 10 });
    expect(discounts.get("c")).toEqual({ amount: 1500, percentage: 10 });
  });

  test("applies 15% to all but the most expensive inscription at 4", () => {
    const discounts = computeDancerDiscountAmounts([
      { id: "a", priceAmount: 10000 },
      { id: "b", priceAmount: 20000 },
      { id: "c", priceAmount: 15000 },
      { id: "d", priceAmount: 12000 },
    ]);

    expect(discounts.get("b")).toEqual({ amount: 0, percentage: 0 });
    expect(discounts.get("a")).toEqual({ amount: 1500, percentage: 15 });
    expect(discounts.get("c")).toEqual({ amount: 2250, percentage: 15 });
    expect(discounts.get("d")).toEqual({ amount: 1800, percentage: 15 });
  });
});

describe("buildChoreographyOperationalFinanceRow", () => {
  test("owes both thresholds of an inscription holding nothing", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [resolvedInscription({ id: "i1" })],
    });

    expect(row.financialStatus).toBe("depositPending");
    expect(row.depositAmount).toEqual({ amount: 3000, status: "complete" });
    expect(row.totalAmount).toEqual({ amount: 10000, status: "complete" });
    // Una coreografía registrada se adeuda completa: la inscripción aporta su
    // faltante a cada uno de los dos cortes de la misma deuda.
    expect(row.owedDepositAmount).toEqual({ amount: 3000, status: "complete" });
    expect(row.owedBalanceAmount).toEqual({
      amount: 10000,
      status: "complete",
    });
    expect(row.registrationCount).toBe(1);
  });

  test("owes only the rest of the total once the seña is covered", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          allocatedAmount: 3000,
          financialStatus: "depositMet",
          id: "i1",
          owedBalanceAmount: 7000,
          owedDepositAmount: 0,
        }),
      ],
    });

    expect(row.financialStatus).toBe("depositMet");
    expect(row.allocatedAmount).toBe(3000);
    expect(row.owedDepositAmount).toEqual({ amount: 0, status: "complete" });
    expect(row.owedBalanceAmount).toEqual({ amount: 7000, status: "complete" });
  });

  test("still reports the total of a paid choreography but owes nothing", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          allocatedAmount: 10000,
          financialStatus: "paidInFull",
          id: "i1",
          owedBalanceAmount: 0,
          owedDepositAmount: 0,
        }),
      ],
    });

    expect(row.financialStatus).toBe("paidInFull");
    expect(row.totalAmount).toEqual({ amount: 10000, status: "complete" });
    expect(row.owedDepositAmount).toEqual({ amount: 0, status: "complete" });
    expect(row.owedBalanceAmount).toEqual({ amount: 0, status: "complete" });
    expect(row.allocatedAmount).toBe(10000);
  });

  test("a single uncovered dancer pulls a mixed roster down to deposit pending", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          allocatedAmount: 3000,
          financialStatus: "depositMet",
          id: "i1",
          owedBalanceAmount: 7000,
          owedDepositAmount: 0,
        }),
        resolvedInscription({ id: "i2" }),
        resolvedInscription({
          allocatedAmount: 10000,
          financialStatus: "paidInFull",
          id: "i3",
          owedBalanceAmount: 0,
          owedDepositAmount: 0,
        }),
      ],
    });

    // La marca de agua leía `señada` acá, es decir *puede competir*, con un
    // bailarín sin cubrir adentro.
    expect(row.financialStatus).toBe("depositPending");
    expect(row.totalAmount).toEqual({ amount: 30000, status: "complete" });
    expect(row.owedDepositAmount).toEqual({ amount: 3000, status: "complete" });
    expect(row.owedBalanceAmount).toEqual({
      amount: 17000,
      status: "complete",
    });
  });

  test("sums the over-allocated excess and raises it as a choreography anomaly", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          allocatedAmount: 12000,
          financialStatus: "paidInFull",
          id: "i1",
          overAllocatedAmount: 2000,
          owedBalanceAmount: 0,
          owedDepositAmount: 0,
        }),
        resolvedInscription({ id: "i2" }),
      ],
    });

    expect(row.overAllocatedAmount).toBe(2000);
    expect(row.anomalies).toEqual(["overAllocated"]);
  });

  test("keeps a withdrawn inscription in the money rollup and out of the status one", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          allocatedAmount: 10000,
          financialStatus: "paidInFull",
          id: "i1",
          owedBalanceAmount: 0,
          owedDepositAmount: 0,
        }),
        // Withdrawn with the deposit retained: its total is what remains allocated.
        resolvedInscription({
          allocatedAmount: 3000,
          financialStatus: "paidInFull",
          id: "i2",
          overAllocatedAmount: 0,
          owedBalanceAmount: 0,
          owedDepositAmount: 0,
          totalAmount: 3000,
          withdrawn: true,
        }),
      ],
    });

    // The retained money still belongs to this choreography.
    expect(row.allocatedAmount).toBe(13000);
    expect(row.totalAmount).toEqual({ amount: 13000, status: "complete" });
    expect(row.owedBalanceAmount).toEqual({ amount: 0, status: "complete" });
    // The status answers *can it be performed?*, and the withdrawn row is no
    // longer part of that answer; nor does it count as an inscription.
    expect(row.financialStatus).toBe("paidInFull");
    expect(row.registrationCount).toBe(1);
  });

  test("does not let a withdrawn inscription drag the status rollup down", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          allocatedAmount: 10000,
          financialStatus: "paidInFull",
          id: "i1",
          owedBalanceAmount: 0,
          owedDepositAmount: 0,
        }),
        // A withdrawn row's status is shown nowhere; the rollup has to ignore
        // it even when it reads `depositPending`.
        resolvedInscription({
          financialStatus: "depositPending",
          id: "i2",
          overAllocatedAmount: 0,
          owedBalanceAmount: 0,
          owedDepositAmount: 0,
          totalAmount: 0,
          withdrawn: true,
        }),
      ],
    });

    expect(row.financialStatus).toBe("paidInFull");
  });

  test("reports incomplete amounts when an inscription has no price", () => {
    const row = buildChoreographyOperationalFinanceRow({
      choreography,
      inscriptions: [
        resolvedInscription({
          basePriceAmount: null,
          depositAmount: null,
          id: "i1",
          overAllocatedAmount: null,
          owedBalanceAmount: null,
          owedDepositAmount: null,
          totalAmount: null,
        }),
      ],
    });

    expect(row.basePriceAmount).toEqual({
      amount: 0,
      missingPriceCount: 1,
      status: "incomplete",
    });
    expect(row.totalAmount).toEqual({
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
        inscriptions: [resolvedInscription({ id: "i1" })],
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
      amount: 10000,
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
            allocatedAmount: 3000,
            financialStatus: "depositMet",
            id: "i1",
            owedBalanceAmount: 7000,
            owedDepositAmount: 0,
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

  test("keeps Seña adeudada contained inside Saldo adeudado across a roster", () => {
    const rows = [
      buildChoreographyOperationalFinanceRow({
        choreography,
        inscriptions: [
          resolvedInscription({ id: "i1" }),
          resolvedInscription({
            allocatedAmount: 3000,
            financialStatus: "depositMet",
            id: "i2",
            owedBalanceAmount: 7000,
            owedDepositAmount: 0,
          }),
          resolvedInscription({
            allocatedAmount: 10000,
            financialStatus: "paidInFull",
            id: "i3",
            owedBalanceAmount: 0,
            owedDepositAmount: 0,
          }),
        ],
      }),
    ];

    const summary = buildOperationalFinanceSummaryFromChoreographyRows({
      availableBalanceAmount: 0,
      choreographyFinanceRows: rows,
      totalPaidAmount: 0,
    });

    expect(summary.owedDepositAmount).toEqual({
      amount: 3000,
      status: "complete",
    });
    expect(summary.owedBalanceAmount).toEqual({
      amount: 17000,
      status: "complete",
    });
    expect(summary.owedDepositAmount.amount).toBeLessThanOrEqual(
      summary.owedBalanceAmount.amount,
    );
  });
});

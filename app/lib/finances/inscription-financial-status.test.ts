import { describe, expect, test } from "vitest";

import {
  calculateDepositAmount,
  calculateTotalAmount,
  deriveChoreographyFinancialStatus,
  deriveInscriptionFinancialFigures,
  deriveInscriptionFinancialStatus,
  resolveInscriptionStatusBadge,
} from "./inscription-financial-status";

// Deposit 3000, total 10000: the two thresholds of every edge case.
const thresholds = { depositAmount: 3000, totalAmount: 10000 };

function statusAt(allocatedAmount: number) {
  return deriveInscriptionFinancialStatus({ allocatedAmount, ...thresholds });
}

describe("calculateDepositAmount", () => {
  test("takes the percentage of the undiscounted price, rounded", () => {
    expect(
      calculateDepositAmount({
        priceAmount: 10000,
        requiredDepositPercentage: 30,
      }),
    ).toBe(3000);
    expect(
      calculateDepositAmount({
        priceAmount: 8333,
        requiredDepositPercentage: 30,
      }),
    ).toBe(2500);
  });

  test("does not move when the dancer discount does", () => {
    // The discount lives in the total; the low threshold does not see it, so it
    // does not move under the academy's feet when the roster changes.
    const before = calculateDepositAmount({
      priceAmount: 10000,
      requiredDepositPercentage: 30,
    });
    const total = calculateTotalAmount({
      dancerDiscountAmount: 1500,
      priceAmount: 10000,
    });

    expect(before).toBe(3000);
    expect(total).toBe(8500);
    expect(
      calculateDepositAmount({
        priceAmount: 10000,
        requiredDepositPercentage: 30,
      }),
    ).toBe(before);
  });
});

describe("calculateTotalAmount", () => {
  test("applies the live dancer discount exactly once", () => {
    expect(
      calculateTotalAmount({ dancerDiscountAmount: 1500, priceAmount: 10000 }),
    ).toBe(8500);
  });
});

describe("deriveInscriptionFinancialStatus", () => {
  test("is deposit pending one peso below the deposit", () => {
    expect(statusAt(2999)).toBe("depositPending");
  });

  test("is deposit met exactly at the deposit", () => {
    expect(statusAt(3000)).toBe("depositMet");
  });

  test("is deposit met one peso below the total", () => {
    expect(statusAt(9999)).toBe("depositMet");
  });

  test("is paid in full exactly at the total", () => {
    expect(statusAt(10000)).toBe("paidInFull");
  });

  test("is paid in full above the total, rather than erroring", () => {
    // The limit is `≥`, not `=`: passive over-allocation is tolerated and reported
    // as an anomaly, not as a state.
    expect(statusAt(12000)).toBe("paidInFull");
  });

  test("holds most of its deposit and still reads deposit pending, not unpaid", () => {
    expect(statusAt(2700)).toBe("depositPending");
  });

  test("cannot have crossed a threshold it cannot compute", () => {
    expect(
      deriveInscriptionFinancialStatus({
        allocatedAmount: 50000,
        depositAmount: null,
        totalAmount: null,
      }),
    ).toBe("depositPending");
  });
});

describe("deriveInscriptionFinancialFigures", () => {
  test("names the shortfall of an inscription holding most of its deposit", () => {
    const figures = deriveInscriptionFinancialFigures({
      allocatedAmount: 2700,
      thresholds,
    });

    expect(figures.financialStatus).toBe("depositPending");
    expect(figures.owedDepositAmount).toBe(300);
    expect(figures.owedBalanceAmount).toBe(7300);
    expect(figures.anomalies).toEqual([]);
  });

  test("floors both owed figures at zero and keeps deposit inside saldo", () => {
    const figures = deriveInscriptionFinancialFigures({
      allocatedAmount: 12000,
      thresholds,
    });

    expect(figures.owedDepositAmount).toBe(0);
    expect(figures.owedBalanceAmount).toBe(0);
    expect(figures.owedDepositAmount).toBeLessThanOrEqual(
      figures.owedBalanceAmount!,
    );
  });

  test("owed deposit never exceeds owed balance at any allocation", () => {
    for (const allocatedAmount of [0, 1, 2999, 3000, 9999, 10000, 12000]) {
      const figures = deriveInscriptionFinancialFigures({
        allocatedAmount,
        thresholds,
      });

      expect(figures.owedDepositAmount!).toBeLessThanOrEqual(
        figures.owedBalanceAmount!,
      );
    }
  });

  test("reports the excess above the total as a self-clearing anomaly", () => {
    const figures = deriveInscriptionFinancialFigures({
      allocatedAmount: 12000,
      thresholds,
    });

    expect(figures.overAllocatedAmount).toBe(2000);
    expect(figures.anomalies).toEqual(["overAllocated"]);
  });

  test("raises no anomaly exactly at the total", () => {
    const figures = deriveInscriptionFinancialFigures({
      allocatedAmount: 10000,
      thresholds,
    });

    expect(figures.overAllocatedAmount).toBe(0);
    expect(figures.anomalies).toEqual([]);
  });

  test("leaves every figure unknown without an applicable price", () => {
    const figures = deriveInscriptionFinancialFigures({
      allocatedAmount: 5000,
      thresholds: { depositAmount: null, totalAmount: null },
    });

    expect(figures.owedDepositAmount).toBeNull();
    expect(figures.owedBalanceAmount).toBeNull();
    expect(figures.overAllocatedAmount).toBeNull();
    expect(figures.anomalies).toEqual([]);
  });
});

describe("deriveInscriptionFinancialFigures on a withdrawn inscription", () => {
  test("keeps what remains allocated as the total, not zero", () => {
    const figures = deriveInscriptionFinancialFigures({
      allocatedAmount: 3000,
      thresholds,
      withdrawn: true,
    });

    // The deposit may have been forfeited: the money left on the row is the
    // record of that retention, so money and obligation are the same number.
    expect(figures.totalAmount).toBe(3000);
    expect(figures.allocatedAmount).toBe(3000);
    expect(figures.owedBalanceAmount).toBe(0);
    expect(figures.owedDepositAmount).toBe(0);
  });

  test("cannot be over-allocated, whatever it holds", () => {
    const figures = deriveInscriptionFinancialFigures({
      allocatedAmount: 12000,
      thresholds,
      withdrawn: true,
    });

    expect(figures.overAllocatedAmount).toBe(0);
    expect(figures.anomalies).toEqual([]);
    expect(figures.totalAmount).toBe(12000);
  });

  test("keeps exposing its deposit figure so the saldo can still be taken off", () => {
    expect(
      deriveInscriptionFinancialFigures({
        allocatedAmount: 10000,
        thresholds,
        withdrawn: true,
      }).depositAmount,
    ).toBe(3000);
  });

  test("holds nothing and owes nothing", () => {
    const figures = deriveInscriptionFinancialFigures({
      allocatedAmount: 0,
      thresholds,
      withdrawn: true,
    });

    expect(figures.totalAmount).toBe(0);
    expect(figures.owedBalanceAmount).toBe(0);
    expect(figures.anomalies).toEqual([]);
  });
});

describe("resolveInscriptionStatusBadge", () => {
  test("puts Retirada above the over-allocation anomaly", () => {
    expect(
      resolveInscriptionStatusBadge({
        anomalies: ["overAllocated"],
        financialStatus: "paidInFull",
        withdrawn: true,
      }),
    ).toEqual({ kind: "withdrawn" });
  });

  test("lets an anomaly replace the status badge", () => {
    expect(
      resolveInscriptionStatusBadge({
        anomalies: ["overAllocated"],
        financialStatus: "depositMet",
      }),
    ).toEqual({ anomaly: "overAllocated", kind: "anomaly" });
  });

  test("falls back to the status when there is no other axis", () => {
    expect(
      resolveInscriptionStatusBadge({
        anomalies: [],
        financialStatus: "depositPending",
        withdrawn: false,
      }),
    ).toEqual({ kind: "status", status: "depositPending" });
  });
});

describe("deriveChoreographyFinancialStatus", () => {
  test("is the minimum, so one uncovered dancer pulls the whole choreography down", () => {
    expect(
      deriveChoreographyFinancialStatus([
        "paidInFull",
        "paidInFull",
        "depositPending",
      ]),
    ).toBe("depositPending");
  });

  test("does not stick high the way the watermark did", () => {
    // The high-water mark read `señada` here and hid the laggard.
    expect(
      deriveChoreographyFinancialStatus(["depositMet", "depositPending"]),
    ).toBe("depositPending");
  });

  test("is paid in full only when every inscription crossed the total", () => {
    expect(
      deriveChoreographyFinancialStatus(["paidInFull", "paidInFull"]),
    ).toBe("paidInFull");
    expect(
      deriveChoreographyFinancialStatus(["paidInFull", "depositMet"]),
    ).toBe("depositMet");
  });

  test("is deposit pending without inscriptions, which cannot compete either", () => {
    expect(deriveChoreographyFinancialStatus([])).toBe("depositPending");
  });
});

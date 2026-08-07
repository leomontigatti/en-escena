import { describe, expect, test } from "vitest";

import {
  calculateDepositAmount,
  calculateTotalAmount,
  deriveChoreographyFinancialStatus,
  deriveInscriptionFinancialFigures,
  deriveInscriptionFinancialStatus,
} from "./inscription-financial-status";

// Seña 3000, total 10000: los dos umbrales de todos los casos de borde.
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
    // El descuento vive en el total; el umbral bajo no lo ve, así que no se
    // mueve bajo los pies de la academia cuando cambia el roster.
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
  test("is deposit pending one peso below the seña", () => {
    expect(statusAt(2999)).toBe("depositPending");
  });

  test("is deposit met exactly at the seña", () => {
    expect(statusAt(3000)).toBe("depositMet");
  });

  test("is deposit met one peso below the total", () => {
    expect(statusAt(9999)).toBe("depositMet");
  });

  test("is paid in full exactly at the total", () => {
    expect(statusAt(10000)).toBe("paidInFull");
  });

  test("is paid in full above the total, rather than erroring", () => {
    // El límite es `≥`, no `=`: la sobreasignación pasiva se tolera y se
    // denuncia como anomalía, no como estado.
    expect(statusAt(12000)).toBe("paidInFull");
  });

  test("holds most of its seña and still reads deposit pending, not unpaid", () => {
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
  test("names the shortfall of an inscription holding most of its seña", () => {
    const figures = deriveInscriptionFinancialFigures({
      allocatedAmount: 2700,
      thresholds,
    });

    expect(figures.financialStatus).toBe("depositPending");
    expect(figures.owedDepositAmount).toBe(300);
    expect(figures.owedBalanceAmount).toBe(7300);
    expect(figures.anomalies).toEqual([]);
  });

  test("floors both owed figures at zero and keeps seña inside saldo", () => {
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
    // La marca de agua leía `señada` acá y escondía al rezagado.
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

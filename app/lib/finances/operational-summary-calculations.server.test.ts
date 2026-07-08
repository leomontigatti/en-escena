import { describe, expect, test, vi, afterEach } from "vitest";

import type { prices } from "@/db/schema";

import {
  buildChoreographyOperationalFinanceRows,
  buildOperationalFinanceSummary,
} from "./operational-summary-calculations.server";

type FinancePriceRow = typeof prices.$inferSelect;

afterEach(() => {
  vi.useRealTimers();
});

describe("operational finance price resolution", () => {
  test("uses the Cordoba business date and ignores expired prices for unsigned choreographies", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T02:30:00.000Z"));

    const academyId = "academy_1";
    const choreographyRows = [
      {
        academyId,
        choreographyScheduleId: "schedule_general",
        groupType: "solo" as const,
        id: "choreography_1",
        name: "Aire",
        scheduleCapacityScheduleId: "schedule_1",
      },
    ];
    const priceRows = [
      createPriceRow({
        amount: 12000,
        paymentDeadline: "2026-05-31",
        scheduleId: "schedule_1",
      }),
      createPriceRow({
        amount: 15000,
        paymentDeadline: "2026-06-30",
        scheduleId: null,
      }),
      createPriceRow({
        amount: 18000,
        paymentDeadline: null,
        scheduleId: "schedule_1",
      }),
    ];

    const choreographyFinanceRows = buildChoreographyOperationalFinanceRows({
      academyId,
      choreographyRows,
      financialStates: new Map([["choreography_1", "impaga"]]),
      invoiceImputedAmounts: new Map(),
      invoiceRows: [],
      priceRows,
      requiredDepositPercentage: 30,
    });
    const summary = buildOperationalFinanceSummary({
      academyId,
      choreographyRows,
      financialStates: new Map([["choreography_1", "impaga"]]),
      imputationAmountsByAcademy: new Map(),
      invoiceImputedAmounts: new Map(),
      invoiceRows: [],
      paymentAmountsByAcademy: new Map(),
      priceRows,
      requiredDepositPercentage: 30,
    });

    expect(choreographyFinanceRows).toMatchObject([
      {
        basePriceAmount: { amount: 12000, status: "complete" },
        owedAmount: { amount: 12000, status: "complete" },
        owedDepositAmount: { amount: 3600, status: "complete" },
      },
    ]);
    expect(summary).toMatchObject({
      owedAmount: { amount: 12000, status: "complete" },
      owedDepositAmount: { amount: 3600, status: "complete" },
    });
  });

  test("uses the schedule fallback price before a general dated price", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));

    const academyId = "academy_1";
    const choreographyFinanceRows = buildChoreographyOperationalFinanceRows({
      academyId,
      choreographyRows: [
        {
          academyId,
          choreographyScheduleId: "schedule_general",
          groupType: "solo",
          id: "choreography_1",
          name: "Aire",
          scheduleCapacityScheduleId: "schedule_1",
        },
      ],
      financialStates: new Map([["choreography_1", "impaga"]]),
      invoiceImputedAmounts: new Map(),
      invoiceRows: [],
      priceRows: [
        createPriceRow({
          amount: 12000,
          paymentDeadline: "2026-05-31",
          scheduleId: "schedule_1",
        }),
        createPriceRow({
          amount: 15000,
          paymentDeadline: "2026-06-30",
          scheduleId: null,
        }),
        createPriceRow({
          amount: 18000,
          paymentDeadline: null,
          scheduleId: "schedule_1",
        }),
      ],
      requiredDepositPercentage: 30,
    });

    expect(choreographyFinanceRows).toMatchObject([
      {
        basePriceAmount: { amount: 18000, status: "complete" },
        owedAmount: { amount: 18000, status: "complete" },
        owedDepositAmount: { amount: 5400, status: "complete" },
      },
    ]);
  });

  test("shows incomplete amounts when every price in scope is expired", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));

    const academyId = "academy_1";
    const choreographyFinanceRows = buildChoreographyOperationalFinanceRows({
      academyId,
      choreographyRows: [
        {
          academyId,
          choreographyScheduleId: null,
          groupType: "solo",
          id: "choreography_1",
          name: "Aire",
          scheduleCapacityScheduleId: null,
        },
      ],
      financialStates: new Map([["choreography_1", "impaga"]]),
      invoiceImputedAmounts: new Map(),
      invoiceRows: [],
      priceRows: [
        createPriceRow({
          amount: 12000,
          paymentDeadline: "2026-05-31",
          scheduleId: null,
        }),
      ],
      requiredDepositPercentage: 30,
    });

    expect(choreographyFinanceRows).toMatchObject([
      {
        basePriceAmount: {
          amount: 0,
          missingPriceCount: 1,
          status: "incomplete",
        },
        owedAmount: {
          amount: 0,
          missingPriceCount: 1,
          status: "incomplete",
        },
        owedDepositAmount: {
          amount: 0,
          missingPriceCount: 1,
          status: "incomplete",
        },
      },
    ]);
  });
});

function createPriceRow(input: {
  amount: number;
  paymentDeadline: string | null;
  scheduleId: string | null;
}): FinancePriceRow {
  return {
    amount: input.amount,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    eventId: "event_1",
    groupType: "solo",
    id: `price_${input.scheduleId ?? "general"}_${input.paymentDeadline ?? "fallback"}_${input.amount}`,
    name: "Precio",
    paymentDeadline: input.paymentDeadline,
    scheduleId: input.scheduleId,
  };
}

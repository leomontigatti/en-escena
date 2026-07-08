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
        registrationCount: 1,
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

  test("multiplies the unit base price by the choreography registration count", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00.000Z"));

    const academyId = "academy_1";
    const choreographyRows = [
      {
        academyId,
        choreographyScheduleId: null,
        groupType: "duo" as const,
        id: "choreography_1",
        name: "Duo",
        registrationCount: 2,
        scheduleCapacityScheduleId: null,
      },
    ];
    const priceRows = [
      createPriceRow({
        amount: 36000,
        groupType: "duo",
        paymentDeadline: "2026-05-31",
        scheduleId: null,
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
        basePriceAmount: { amount: 72000, status: "complete" },
        owedAmount: { amount: 72000, status: "complete" },
        owedDepositAmount: { amount: 21600, status: "complete" },
      },
    ]);
    expect(summary).toMatchObject({
      owedAmount: { amount: 72000, status: "complete" },
      owedDepositAmount: { amount: 21600, status: "complete" },
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
          registrationCount: 1,
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
          registrationCount: 1,
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

  test("keeps the latest active seña snapshot authoritative while pending", () => {
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
          registrationCount: 1,
          scheduleCapacityScheduleId: null,
        },
      ],
      financialStates: new Map([["choreography_1", "impaga"]]),
      invoiceImputedAmounts: new Map(),
      invoiceRows: [
        createInvoiceRow({
          basePriceAmount: 10000,
          choreographyId: "choreography_1",
          id: "invoice_old",
          invoiceAmount: 3000,
          invoiceNumber: 1,
          issueDate: "2026-03-20",
        }),
        createInvoiceRow({
          basePriceAmount: 12000,
          choreographyId: "choreography_1",
          id: "invoice_new",
          invoiceAmount: 3600,
          invoiceNumber: 2,
          issueDate: "2026-04-05",
        }),
      ],
      priceRows: [],
      requiredDepositPercentage: 30,
    });

    expect(choreographyFinanceRows).toMatchObject([
      {
        basePriceAmount: { amount: 12000, status: "complete" },
        financialState: "impaga",
        owedAmount: { amount: 12000, status: "complete" },
        owedDepositAmount: { amount: 3600, status: "complete" },
      },
    ]);
  });

  test("uses the active seña snapshot for pending and paid states", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));

    const academyId = "academy_1";
    const invoiceRows = [
      createInvoiceRow({
        basePriceAmount: 12000,
        choreographyId: "pending",
        id: "invoice_pending",
        invoiceAmount: 3600,
        invoiceNumber: 1,
        issueDate: "2026-04-05",
      }),
      createInvoiceRow({
        basePriceAmount: 12000,
        choreographyId: "paid",
        depositCompletedOn: "2026-04-10",
        id: "invoice_paid",
        invoiceAmount: 3600,
        invoiceNumber: 2,
        issueDate: "2026-04-05",
      }),
    ];
    const invoiceImputedAmounts = new Map([["invoice_paid", 3600]]);
    const choreographyFinanceRows = buildChoreographyOperationalFinanceRows({
      academyId,
      choreographyRows: [
        {
          academyId,
          choreographyScheduleId: null,
          groupType: "solo",
          id: "pending",
          name: "Pendiente",
          registrationCount: 1,
          scheduleCapacityScheduleId: null,
        },
        {
          academyId,
          choreographyScheduleId: null,
          groupType: "solo",
          id: "paid",
          name: "Pagada",
          registrationCount: 1,
          scheduleCapacityScheduleId: null,
        },
      ],
      financialStates: new Map([
        ["pending", "impaga"],
        ["paid", "señada"],
      ]),
      invoiceImputedAmounts,
      invoiceRows,
      priceRows: [],
      requiredDepositPercentage: 50,
    });
    const summary = buildOperationalFinanceSummary({
      academyId,
      choreographyRows: [
        {
          academyId,
          choreographyScheduleId: null,
          groupType: "solo",
          id: "pending",
          name: "Pendiente",
          registrationCount: 1,
          scheduleCapacityScheduleId: null,
        },
        {
          academyId,
          choreographyScheduleId: null,
          groupType: "solo",
          id: "paid",
          name: "Pagada",
          registrationCount: 1,
          scheduleCapacityScheduleId: null,
        },
      ],
      financialStates: new Map([
        ["pending", "impaga"],
        ["paid", "señada"],
      ]),
      imputationAmountsByAcademy: new Map(),
      invoiceImputedAmounts,
      invoiceRows,
      paymentAmountsByAcademy: new Map(),
      priceRows: [],
      requiredDepositPercentage: 50,
    });

    expect(choreographyFinanceRows).toMatchObject([
      {
        basePriceAmount: { amount: 12000, status: "complete" },
        depositAmount: { amount: 3600, status: "complete" },
        financialState: "impaga",
        owedAmount: { amount: 12000, status: "complete" },
        owedDepositAmount: { amount: 3600, status: "complete" },
      },
      {
        basePriceAmount: { amount: 12000, status: "complete" },
        depositAmount: { amount: 3600, status: "complete" },
        depositCompletedOn: "2026-04-10",
        financialState: "señada",
        owedAmount: { amount: 8400, status: "complete" },
        owedDepositAmount: { amount: 0, status: "complete" },
      },
    ]);
    expect(summary).toMatchObject({
      owedAmount: { amount: 20400, status: "complete" },
      owedDepositAmount: { amount: 3600, status: "complete" },
    });
  });
});

function createPriceRow(input: {
  amount: number;
  groupType?: "solo" | "duo" | "trio" | "grupal";
  paymentDeadline: string | null;
  scheduleId: string | null;
}): FinancePriceRow {
  return {
    amount: input.amount,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    eventId: "event_1",
    groupType: input.groupType ?? "solo",
    id: `price_${input.scheduleId ?? "general"}_${input.paymentDeadline ?? "fallback"}_${input.amount}`,
    name: "Precio",
    paymentDeadline: input.paymentDeadline,
    scheduleId: input.scheduleId,
  };
}

function createInvoiceRow(input: {
  basePriceAmount: number;
  choreographyId: string;
  depositCompletedOn?: string | null;
  id: string;
  invoiceAmount: number;
  invoiceNumber: number;
  issueDate: string;
}) {
  return {
    academyId: "academy_1",
    basePriceAmount: input.basePriceAmount,
    choreographyId: input.choreographyId,
    depositCompletedOn: input.depositCompletedOn ?? null,
    id: input.id,
    invoiceAmount: input.invoiceAmount,
    invoiceNumber: input.invoiceNumber,
    issueDate: input.issueDate,
    invoiceType: "sena" as const,
  };
}

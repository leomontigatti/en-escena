import type {
  MovementsListLoaderData,
  PaymentMovementsListRow,
  RefundMovementsListRow,
} from "./server";

export function movementsListFiltersFixture(): MovementsListLoaderData["filters"] {
  return {
    availability: null,
    kind: null,
    method: null,
    order: { columnId: "date", direction: "desc" },
    page: 1,
    query: "",
  };
}

export function movementsListLoaderDataFixture(
  overrides: Partial<MovementsListLoaderData> = {},
): MovementsListLoaderData {
  return {
    canWrite: true,
    filters: movementsListFiltersFixture(),
    hasAnyMovement: true,
    rows: [paymentRowFixture()],
    selectedEventId: "event_1",
    summary: {
      availableAmount: 4000,
      netAmount: 10000,
      paymentsAmount: 10000,
      refundsAmount: 0,
    },
    totalCount: 1,
    totalPages: 1,
    ...overrides,
  };
}

export function paymentRowFixture(
  overrides: Partial<PaymentMovementsListRow> = {},
): PaymentMovementsListRow {
  return {
    academyId: "academy_1",
    academyName: "Academia Norte",
    amount: 10000,
    availableAmount: 4000,
    date: "2026-03-15",
    id: "payment_1",
    kind: "payment",
    method: "transferencia",
    number: 1,
    ...overrides,
  };
}

export function refundRowFixture(
  overrides: Partial<RefundMovementsListRow> = {},
): RefundMovementsListRow {
  return {
    academyId: "academy_1",
    academyName: "Academia Norte",
    amount: 2500,
    availableAmount: null,
    date: "2026-03-17",
    id: "refund_1",
    internalNote: "Se retiró",
    kind: "refund",
    method: "efectivo",
    number: 1,
    ownerAvailableBalanceAmount: 1500,
    reference: "REC-1",
    version: "2026-03-17T12:00:00.000Z",
    ...overrides,
  };
}

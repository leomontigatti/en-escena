import type {
  MovementsListLoaderData,
  PaymentMovementsListRow,
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

function paymentRowFixture(
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

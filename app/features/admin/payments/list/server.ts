import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { academies, payments } from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { canWriteInAdminPanel } from "@/lib/auth/admin-panel-access";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { paymentAvailableAmountSql } from "@/lib/finances/payment-available-amount.server";
import { paymentMethodValues } from "@/lib/finances/payment-methods";
import { eventSequenceNumberDigits } from "@/lib/events/sequence-number";
import { adminListPageSize } from "@/lib/admin/admin-list";
import {
  paginateList,
  readListQuery,
  type ListQuerySpec,
} from "@/lib/list-query/list-query";
import {
  listSearchCondition,
  redirectToCanonicalListUrl,
} from "@/lib/list-query/list-query.server";

type PaymentsListMethod = PaymentsListRow["paymentMethod"];
type PaymentsListOrder = {
  columnId: "paymentDate";
  direction: "asc" | "desc";
};

/**
 * Whether the list is narrowed to payments that still have money free. It is a
 * facet and not a sort: the administrator reaches it from the `Disponible`
 * metric —"there is money uncommitted, show me where"— which is a filtering
 * question and not an ordering one.
 */
type PaymentsListAvailability = "con" | "sin";

type PaymentsListFilters = {
  availability: PaymentsListAvailability | null;
  method: PaymentsListMethod | null;
  order: PaymentsListOrder;
  page: number;
  query: string;
};

export type PaymentsListRow = {
  academyId: string;
  academyName: string;
  amount: number;
  // What is still free on this payment. See `paymentAvailableAmountSql`: it is
  // the payment's own remainder, and it carries no provenance.
  availableAmount: number;
  id: string;
  paymentDate: string;
  paymentMethod: "efectivo" | "mercado_pago" | "otro" | "transferencia";
  paymentNumber: number;
};

/**
 * The event's money position, over **every** payment of the active event: it
 * answers the same question no matter how the list below it is narrowed. A total
 * that moved with the search box would be a different question than the one the
 * card asks, and the whole use of `Disponible` is to be read first and filtered
 * on second.
 */
export type PaymentsListSummary = {
  availableAmount: number;
  totalAmount: number;
};

export type PaymentsListLoaderData = {
  /** False for the auditor: no `Nuevo pago`, and the `Exportar` entry instead. */
  canWrite: boolean;
  filters: PaymentsListFilters;
  hasAnyPayment: boolean;
  rows: PaymentsListRow[];
  selectedEventId: string | null;
  summary: PaymentsListSummary;
  totalCount: number;
  totalPages: number;
};

const paymentsListSpec: ListQuerySpec<PaymentsListOrder["columnId"]> = {
  orderColumnIds: ["paymentDate"],
  defaultOrder: { columnId: "paymentDate", direction: "desc" },
};

export async function loadPaymentsList(
  request: Request,
): Promise<PaymentsListLoaderData> {
  const user = await requireInternalUser(request, ["admin", "auditor"]);
  const canWrite = canWriteInAdminPanel(user.role);
  const eventContext = await loadEventContext(request);
  const selectedEventId = eventContext.selectedEventId;
  const url = new URL(request.url);
  const filters = readPaymentsListFilters(url.searchParams);

  if (selectedEventId === null) {
    return {
      canWrite,
      filters,
      hasAnyPayment: false,
      rows: [] as PaymentsListRow[],
      selectedEventId: null,
      summary: { availableAmount: 0, totalAmount: 0 },
      totalCount: 0,
      totalPages: 1,
    };
  }

  const where = buildPaymentsWhere(selectedEventId, filters);
  // Unfiltered on purpose, and in the same pass as `hasAnyPayment`: both read
  // the whole event and neither one narrows with the list.
  const [{ count: totalUnfilteredCount, summaryAvailable, summaryTotal }] =
    await db
      .select({
        count: sql<number>`count(*)`,
        summaryAvailable: sql<number>`coalesce(sum(${paymentAvailableAmountSql}), 0)`,
        summaryTotal: sql<number>`coalesce(sum(${payments.amount}), 0)`,
      })
      .from(payments)
      .where(eq(payments.eventId, selectedEventId));
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(payments)
    .innerJoin(academies, eq(payments.academyId, academies.id))
    .where(where);
  const totalCount = Number(count);
  const { limit, offset, page, totalPages } = paginateList({
    page: filters.page,
    pageSize: adminListPageSize,
    totalCount,
  });
  const normalizedFilters = { ...filters, page };

  const paymentRows = await db
    .select({
      academyId: payments.academyId,
      academyName: academies.name,
      amount: payments.amount,
      availableAmount: paymentAvailableAmountSql,
      id: payments.id,
      paymentDate: payments.paymentDate,
      paymentMethod: payments.paymentMethod,
      paymentNumber: payments.paymentNumber,
    })
    .from(payments)
    .innerJoin(academies, eq(payments.academyId, academies.id))
    .where(where)
    .orderBy(...buildPaymentsOrderBy(normalizedFilters.order))
    .limit(limit)
    .offset(offset);

  redirectToCanonicalListUrl(request, {
    facets: {
      medio: normalizedFilters.method,
      disponible: normalizedFilters.availability,
    },
    query: {
      order: normalizedFilters.order,
      page: normalizedFilters.page,
      search: normalizedFilters.query,
    },
    spec: paymentsListSpec,
  });

  return {
    canWrite,
    filters: normalizedFilters,
    hasAnyPayment: Number(totalUnfilteredCount) > 0,
    rows: paymentRows.map((row) => ({
      ...row,
      availableAmount: Number(row.availableAmount),
    })) satisfies PaymentsListRow[],
    selectedEventId,
    summary: {
      availableAmount: Number(summaryAvailable),
      totalAmount: Number(summaryTotal),
    },
    totalCount,
    totalPages,
  };
}

function readPaymentsListFilters(
  searchParams: URLSearchParams,
): PaymentsListFilters {
  const listQuery = readListQuery(searchParams, paymentsListSpec);

  return {
    availability: readPaymentsListAvailability(searchParams.get("disponible")),
    method: readPaymentsListMethod(searchParams.get("medio")),
    order: listQuery.order,
    page: listQuery.page,
    query: listQuery.search,
  };
}

function readPaymentsListAvailability(
  value: string | null,
): PaymentsListAvailability | null {
  return value === "con" || value === "sin" ? value : null;
}

function readPaymentsListMethod(value: string | null) {
  return paymentMethodValues.find((method) => method === value) ?? null;
}

function buildPaymentsWhere(
  selectedEventId: string,
  filters: PaymentsListFilters,
) {
  const conditions: SQL[] = [eq(payments.eventId, selectedEventId)];
  const searchCondition = listSearchCondition(filters.query, [
    academies.name,
    sql`lpad(cast(${payments.paymentNumber} as text), ${eventSequenceNumberDigits}, '0')`,
  ]);

  if (searchCondition) {
    conditions.push(searchCondition);
  }

  if (filters.method !== null) {
    conditions.push(eq(payments.paymentMethod, filters.method));
  }

  // A predicate over the derived figure rather than a `having`: the remainder is
  // a correlated subquery per payment, so it needs no grouping and the two count
  // queries stay the shape they already had.
  if (filters.availability !== null) {
    conditions.push(
      filters.availability === "con"
        ? sql`${paymentAvailableAmountSql} > 0`
        : sql`${paymentAvailableAmountSql} = 0`,
    );
  }

  return and(...conditions);
}

function buildPaymentsOrderBy(order: PaymentsListOrder) {
  const orderPaymentDate =
    order.direction === "asc"
      ? asc(payments.paymentDate)
      : desc(payments.paymentDate);
  const orderPaymentNumber =
    order.direction === "asc"
      ? asc(payments.paymentNumber)
      : desc(payments.paymentNumber);

  return [orderPaymentDate, orderPaymentNumber, desc(payments.id)];
}

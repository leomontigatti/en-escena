import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, payments } from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { paymentAvailableAmountSql } from "@/lib/finances/payment-available-amount.server";
import { paymentMethodValues } from "@/lib/finances/payment-methods";
import { eventSequenceNumberDigits } from "@/lib/events/sequence-number";

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
  filters: PaymentsListFilters;
  hasAnyPayment: boolean;
  rows: PaymentsListRow[];
  selectedEventId: string | null;
  summary: PaymentsListSummary;
  totalCount: number;
  totalPages: number;
};

const paymentsPageSize = 50;
const defaultPaymentsOrder: PaymentsListOrder = {
  columnId: "paymentDate",
  direction: "desc",
};

export async function loadPaymentsList(
  request: Request,
): Promise<PaymentsListLoaderData> {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(request);
  const selectedEventId = eventContext.selectedEventId;
  const url = new URL(request.url);
  const filters = readPaymentsListFilters(url.searchParams);

  if (selectedEventId === null) {
    return {
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
  const totalPages = Math.max(1, Math.ceil(totalCount / paymentsPageSize));
  const page = Math.min(filters.page, totalPages);
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
    .limit(paymentsPageSize)
    .offset((page - 1) * paymentsPageSize);
  const canonicalSearch = buildCanonicalPaymentsSearch({
    currentSearch: url.search,
    filters: normalizedFilters,
  });
  const currentSearch = new URLSearchParams(url.search).toString();

  if (canonicalSearch !== currentSearch) {
    throw redirect(
      canonicalSearch.length > 0
        ? `${url.pathname}?${canonicalSearch}`
        : url.pathname,
    );
  }

  return {
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
  return {
    availability: readPaymentsListAvailability(searchParams.get("disponible")),
    method: readPaymentsListMethod(searchParams.get("medio")),
    order: readPaymentsOrder(searchParams.get("orden")),
    page: readPage(searchParams),
    query: searchParams.get("busqueda")?.trim() ?? "",
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

function readPaymentsOrder(value: string | null): PaymentsListOrder {
  return value === "paymentDate:asc"
    ? { columnId: "paymentDate", direction: "asc" }
    : defaultPaymentsOrder;
}

function readPage(searchParams: URLSearchParams) {
  const value = Number(searchParams.get("pagina"));

  return Number.isInteger(value) && value > 0 ? value : 1;
}

function buildPaymentsWhere(
  selectedEventId: string,
  filters: PaymentsListFilters,
) {
  const conditions: SQL[] = [eq(payments.eventId, selectedEventId)];
  const query = filters.query.trim();

  if (query.length > 0) {
    conditions.push(
      or(
        ilike(academies.name, `%${query}%`),
        ilike(
          sql`lpad(cast(${payments.paymentNumber} as text), ${eventSequenceNumberDigits}, '0')`,
          `%${query}%`,
        ),
      )!,
    );
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

function buildCanonicalPaymentsSearch(input: {
  currentSearch: string;
  filters: PaymentsListFilters;
}) {
  const searchParams = new URLSearchParams(input.currentSearch);

  if (input.filters.query.length > 0) {
    searchParams.set("busqueda", input.filters.query);
  } else {
    searchParams.delete("busqueda");
  }

  if (input.filters.method !== null) {
    searchParams.set("medio", input.filters.method);
  } else {
    searchParams.delete("medio");
  }

  if (input.filters.availability !== null) {
    searchParams.set("disponible", input.filters.availability);
  } else {
    searchParams.delete("disponible");
  }

  searchParams.delete("estado");

  if (input.filters.order.direction === defaultPaymentsOrder.direction) {
    searchParams.delete("orden");
  } else {
    searchParams.set(
      "orden",
      `${input.filters.order.columnId}:${input.filters.order.direction}`,
    );
  }

  if (input.filters.page > 1) {
    searchParams.set("pagina", String(input.filters.page));
  } else {
    searchParams.delete("pagina");
  }

  return searchParams.toString();
}

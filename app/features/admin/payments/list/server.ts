import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, payments } from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { paymentMethodValues } from "@/lib/finances/payment-methods";
import { paymentNumberDigits } from "@/lib/finances/payment-number";

type PaymentsListMethod = PaymentsListRow["paymentMethod"];
type PaymentsListOrder = {
  columnId: "paymentDate";
  direction: "asc" | "desc";
};

type PaymentsListFilters = {
  method: PaymentsListMethod | null;
  order: PaymentsListOrder;
  page: number;
  query: string;
};

export type PaymentsListRow = {
  academyId: string;
  academyName: string;
  amount: number;
  id: string;
  paymentDate: string;
  paymentMethod: "efectivo" | "mercado_pago" | "otro" | "transferencia";
  paymentNumber: number;
};

export type PaymentsListLoaderData = {
  filters: PaymentsListFilters;
  hasAnyPayment: boolean;
  rows: PaymentsListRow[];
  selectedEventId: string | null;
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
      totalCount: 0,
      totalPages: 1,
    };
  }

  const where = buildPaymentsWhere(selectedEventId, filters);
  const [{ count: totalUnfilteredCount }] = await db
    .select({ count: sql<number>`count(*)` })
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
    rows: paymentRows satisfies PaymentsListRow[],
    selectedEventId,
    totalCount,
    totalPages,
  };
}

function readPaymentsListFilters(
  searchParams: URLSearchParams,
): PaymentsListFilters {
  return {
    method: readPaymentsListMethod(searchParams.get("medio")),
    order: readPaymentsOrder(searchParams.get("orden")),
    page: readPage(searchParams),
    query: searchParams.get("busqueda")?.trim() ?? "",
  };
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
          sql`lpad(cast(${payments.paymentNumber} as text), ${paymentNumberDigits}, '0')`,
          `%${query}%`,
        ),
      )!,
    );
  }

  if (filters.method !== null) {
    conditions.push(eq(payments.paymentMethod, filters.method));
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

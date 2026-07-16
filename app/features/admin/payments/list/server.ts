import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, payments } from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { paymentMethodValues } from "@/lib/finances/payment-methods";
import { paymentNumberDigits } from "@/lib/finances/payment-number";

type AdminPaymentMethod = AdminPaymentRow["paymentMethod"];
type AdminPaymentsListOrder = {
  columnId: "paymentDate";
  direction: "asc" | "desc";
};

type AdminPaymentsListFilters = {
  method: AdminPaymentMethod | null;
  order: AdminPaymentsListOrder;
  page: number;
  query: string;
};

export type AdminPaymentRow = {
  academyId: string;
  academyName: string;
  amount: number;
  id: string;
  paymentDate: string;
  paymentMethod: "efectivo" | "mercado_pago" | "otro" | "transferencia";
  paymentNumber: number;
};

export type AdminPaymentsListLoaderData = {
  filters: AdminPaymentsListFilters;
  hasAnyPayment: boolean;
  rows: AdminPaymentRow[];
  selectedEventId: string | null;
  totalCount: number;
  totalPages: number;
};

const adminPaymentsPageSize = 50;
const defaultAdminPaymentsOrder: AdminPaymentsListOrder = {
  columnId: "paymentDate",
  direction: "desc",
};

export async function loadAdminPaymentsList(
  request: Request,
): Promise<AdminPaymentsListLoaderData> {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);
  const selectedEventId = eventContext.selectedEventId;
  const url = new URL(request.url);
  const filters = readAdminPaymentsListFilters(url.searchParams);

  if (selectedEventId === null) {
    return {
      filters,
      hasAnyPayment: false,
      rows: [] as AdminPaymentRow[],
      selectedEventId: null,
      totalCount: 0,
      totalPages: 1,
    };
  }

  const where = buildAdminPaymentsWhere(selectedEventId, filters);
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
  const totalPages = Math.max(1, Math.ceil(totalCount / adminPaymentsPageSize));
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
    .orderBy(...buildAdminPaymentsOrderBy(normalizedFilters.order))
    .limit(adminPaymentsPageSize)
    .offset((page - 1) * adminPaymentsPageSize);
  const canonicalSearch = buildCanonicalAdminPaymentsSearch({
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
    rows: paymentRows satisfies AdminPaymentRow[],
    selectedEventId,
    totalCount,
    totalPages,
  };
}

function readAdminPaymentsListFilters(
  searchParams: URLSearchParams,
): AdminPaymentsListFilters {
  return {
    method: readAdminPaymentMethod(searchParams.get("medio")),
    order: readAdminPaymentsOrder(searchParams.get("orden")),
    page: readPage(searchParams),
    query: searchParams.get("busqueda")?.trim() ?? "",
  };
}

function readAdminPaymentMethod(value: string | null) {
  return paymentMethodValues.find((method) => method === value) ?? null;
}

function readAdminPaymentsOrder(value: string | null): AdminPaymentsListOrder {
  return value === "paymentDate:asc"
    ? { columnId: "paymentDate", direction: "asc" }
    : defaultAdminPaymentsOrder;
}

function readPage(searchParams: URLSearchParams) {
  const value = Number(searchParams.get("pagina"));

  return Number.isInteger(value) && value > 0 ? value : 1;
}

function buildAdminPaymentsWhere(
  selectedEventId: string,
  filters: AdminPaymentsListFilters,
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

function buildAdminPaymentsOrderBy(order: AdminPaymentsListOrder) {
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

function buildCanonicalAdminPaymentsSearch(input: {
  currentSearch: string;
  filters: AdminPaymentsListFilters;
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

  if (input.filters.order.direction === defaultAdminPaymentsOrder.direction) {
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

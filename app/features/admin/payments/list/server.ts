import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { academies, payments, refunds } from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { canWriteInAdminPanel } from "@/lib/auth/user-role.shared";
import { requireAdminPanelReader } from "@/lib/auth/internal-access.server";
import { paymentAvailableAmountSql } from "@/lib/finances/available-balance.server";
import type { MovementKind } from "@/lib/finances/movement-kinds";
import {
  paymentMethodValues,
  type PaymentMethod,
} from "@/lib/finances/payment-methods";
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
import { readRequestedUrl } from "@/lib/shared/requested-url.server";

type MovementsListOrder = {
  columnId: "date";
  direction: "asc" | "desc";
};

/**
 * Whether the list is narrowed to payments that still have money free. It is a
 * facet and not a sort: the administrator reaches it from the `Disponible`
 * metric —"there is money uncommitted, show me where"— which is a filtering
 * question and not an ordering one. A refund has no `Disponible`, so either
 * value leaves refunds out.
 */
type MovementsListAvailability = "con" | "sin";

type MovementsListFilters = {
  availability: MovementsListAvailability | null;
  kind: MovementKind | null;
  method: PaymentMethod | null;
  order: MovementsListOrder;
  page: number;
  query: string;
};

type MovementsListRowBase = {
  academyId: string;
  academyName: string;
  /** Positive on both kinds: the kind tells money in from money out. */
  amount: number;
  date: string;
  id: string;
  method: PaymentMethod;
  /** The movement's number in its own series: payments and refunds count apart. */
  number: number;
};

export type PaymentMovementsListRow = MovementsListRowBase & {
  // What is still free on this payment. See `paymentAvailableAmountSql`: its
  // own remainder less the share of the owner's refunds it carries, with no
  // provenance.
  availableAmount: number;
  kind: "payment";
};

export type RefundMovementsListRow = MovementsListRowBase & {
  availableAmount: null;
  kind: "refund";
};

export type MovementsListRow = PaymentMovementsListRow | RefundMovementsListRow;

/**
 * The event's money position, over **every** movement of the active event: it
 * answers the same question no matter how the list below it is narrowed. A total
 * that moved with the search box would be a different question than the one the
 * card asks, and the whole use of `Disponible` is to be read first and filtered
 * on second. `Pagos`, `Reembolsos` and `Neto` are the three figures the
 * `Recaudación` workbook closes with.
 */
export type MovementsListSummary = {
  availableAmount: number;
  netAmount: number;
  paymentsAmount: number;
  refundsAmount: number;
};

export type MovementsListLoaderData = {
  /**
   * False for the auditor: no `Nuevo movimiento`, the `Exportar` entry instead.
   */
  canWrite: boolean;
  filters: MovementsListFilters;
  hasAnyMovement: boolean;
  rows: MovementsListRow[];
  selectedEventId: string | null;
  summary: MovementsListSummary;
  totalCount: number;
  totalPages: number;
};

const movementsListSpec: ListQuerySpec<MovementsListOrder["columnId"]> = {
  orderColumnIds: ["date"],
  defaultOrder: { columnId: "date", direction: "desc" },
};

/** The `Tipo` facet's values in the url, Spanish like the rest of it. */
const kindByUrlValue = {
  pago: "payment",
  reembolso: "refund",
} as const satisfies Record<string, MovementKind>;

const urlValueByKind = {
  payment: "pago",
  refund: "reembolso",
} as const satisfies Record<MovementKind, keyof typeof kindByUrlValue>;

const emptySummary: MovementsListSummary = {
  availableAmount: 0,
  netAmount: 0,
  paymentsAmount: 0,
  refundsAmount: 0,
};

export async function loadMovementsList(
  request: Request,
): Promise<MovementsListLoaderData> {
  const user = await requireAdminPanelReader(request);
  const canWrite = canWriteInAdminPanel(user.role);
  const eventContext = await loadEventContext(request);
  const selectedEventId = eventContext.selectedEventId;
  const url = readRequestedUrl(request);
  const filters = readMovementsListFilters(url.searchParams);

  if (selectedEventId === null) {
    return {
      canWrite,
      filters,
      hasAnyMovement: false,
      rows: [],
      selectedEventId: null,
      summary: emptySummary,
      totalCount: 0,
      totalPages: 1,
    };
  }

  const movements = eventMovementsSubquery(selectedEventId);
  const where = buildMovementsWhere(movements, filters);
  // Unfiltered on purpose, and in the same pass as `hasAnyMovement`: both read
  // the whole event and neither one narrows with the list.
  const [[paymentTotals], [refundTotals], [{ count }]] = await Promise.all([
    db
      .select({
        available: sql<number>`coalesce(sum(${paymentAvailableAmountSql}), 0)`,
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
      })
      .from(payments)
      .where(eq(payments.eventId, selectedEventId)),
    db
      .select({
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${refunds.amount}), 0)`,
      })
      .from(refunds)
      .where(eq(refunds.eventId, selectedEventId)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(movements)
      .where(where),
  ]);
  const totalCount = Number(count);
  const { limit, offset, page, totalPages } = paginateList({
    page: filters.page,
    pageSize: adminListPageSize,
    totalCount,
  });
  const normalizedFilters = { ...filters, page };

  const pageRows = await db
    .select({
      academyId: movements.academyId,
      academyName: movements.academyName,
      amount: movements.amount,
      availableAmount: movements.availableAmount,
      date: movements.date,
      id: movements.id,
      kind: movements.kind,
      method: movements.method,
      number: movements.number,
    })
    .from(movements)
    .where(where)
    .orderBy(...buildMovementsOrderBy(movements, normalizedFilters.order))
    .limit(limit)
    .offset(offset);

  redirectToCanonicalListUrl(request, {
    facets: {
      tipo:
        normalizedFilters.kind === null
          ? null
          : urlValueByKind[normalizedFilters.kind],
      medio: normalizedFilters.method,
      disponible: normalizedFilters.availability,
    },
    query: {
      order: normalizedFilters.order,
      page: normalizedFilters.page,
      search: normalizedFilters.query,
    },
    spec: movementsListSpec,
  });

  const paymentsAmount = Number(paymentTotals.total);
  const refundsAmount = Number(refundTotals.total);

  return {
    canWrite,
    filters: normalizedFilters,
    hasAnyMovement:
      Number(paymentTotals.count) + Number(refundTotals.count) > 0,
    rows: pageRows.map(toMovementsListRow),
    selectedEventId,
    summary: {
      availableAmount: Number(paymentTotals.available),
      netAmount: paymentsAmount - refundsAmount,
      paymentsAmount,
      refundsAmount,
    },
    totalCount,
    totalPages,
  };
}

/**
 * Every payment and refund of the event as one set of rows, so the filters,
 * the search, the count and the page read both kinds at once. Each branch
 * names its own columns: a refund has no `Disponible`, and its number counts
 * in its own series.
 */
function eventMovementsSubquery(eventId: string) {
  const paymentMovements = db
    .select({
      kind: sql<MovementKind>`'payment'::text`.as("kind"),
      id: sql<string>`${payments.id}`.as("id"),
      number: sql<number>`${payments.paymentNumber}`.as("number"),
      date: sql<string>`${payments.paymentDate}`.as("date"),
      recordedAt: sql<Date>`${payments.createdAt}`.as("recorded_at"),
      academyId: sql<string>`${payments.academyId}`.as("academy_id"),
      academyName: sql<string>`${academies.name}`.as("academy_name"),
      method: sql<PaymentMethod>`${payments.paymentMethod}`.as("method"),
      amount: sql<number>`${payments.amount}`.as("amount"),
      availableAmount: sql<
        number | null
      >`cast(${paymentAvailableAmountSql} as bigint)`.as("available_amount"),
    })
    .from(payments)
    .innerJoin(academies, eq(payments.academyId, academies.id))
    .where(eq(payments.eventId, eventId));
  const refundMovements = db
    .select({
      kind: sql<MovementKind>`'refund'::text`.as("kind"),
      id: sql<string>`${refunds.id}`.as("id"),
      number: sql<number>`${refunds.refundNumber}`.as("number"),
      date: sql<string>`${refunds.refundDate}`.as("date"),
      recordedAt: sql<Date>`${refunds.createdAt}`.as("recorded_at"),
      academyId: sql<string>`${refunds.academyId}`.as("academy_id"),
      academyName: sql<string>`${academies.name}`.as("academy_name"),
      method: sql<PaymentMethod>`${refunds.refundMethod}`.as("method"),
      amount: sql<number>`${refunds.amount}`.as("amount"),
      availableAmount: sql<number | null>`cast(null as bigint)`.as(
        "available_amount",
      ),
    })
    .from(refunds)
    .innerJoin(academies, eq(refunds.academyId, academies.id))
    .where(eq(refunds.eventId, eventId));

  return paymentMovements.unionAll(refundMovements).as("movement");
}

type EventMovements = ReturnType<typeof eventMovementsSubquery>;

type PageRow = Omit<MovementsListRowBase, "method"> & {
  availableAmount: number | null;
  kind: MovementKind;
  method: PaymentMethod;
};

function toMovementsListRow(row: PageRow): MovementsListRow {
  const shared = {
    ...row,
    amount: Number(row.amount),
    number: Number(row.number),
  };

  return row.kind === "payment"
    ? {
        ...shared,
        availableAmount: Number(row.availableAmount ?? 0),
        kind: "payment",
      }
    : { ...shared, availableAmount: null, kind: "refund" };
}

function readMovementsListFilters(
  searchParams: URLSearchParams,
): MovementsListFilters {
  const listQuery = readListQuery(searchParams, movementsListSpec);

  return {
    availability: readMovementsListAvailability(searchParams.get("disponible")),
    kind: readMovementsListKind(searchParams.get("tipo")),
    method: readMovementsListMethod(searchParams.get("medio")),
    order: listQuery.order,
    page: listQuery.page,
    query: listQuery.search,
  };
}

function readMovementsListAvailability(
  value: string | null,
): MovementsListAvailability | null {
  return value === "con" || value === "sin" ? value : null;
}

function readMovementsListKind(value: string | null): MovementKind | null {
  return value === "pago" || value === "reembolso"
    ? kindByUrlValue[value]
    : null;
}

function readMovementsListMethod(value: string | null) {
  return paymentMethodValues.find((method) => method === value) ?? null;
}

function buildMovementsWhere(
  movements: EventMovements,
  filters: MovementsListFilters,
) {
  const conditions: SQL[] = [];
  const searchCondition = listSearchCondition(filters.query, [
    movements.academyName,
    sql`lpad(cast(${movements.number} as text), ${eventSequenceNumberDigits}, '0')`,
  ]);

  if (searchCondition) {
    conditions.push(searchCondition);
  }

  if (filters.kind !== null) {
    conditions.push(sql`${movements.kind} = ${filters.kind}`);
  }

  if (filters.method !== null) {
    conditions.push(sql`${movements.method} = ${filters.method}`);
  }

  // A refund's `Disponible` is null, so neither comparison holds for it.
  if (filters.availability !== null) {
    conditions.push(
      filters.availability === "con"
        ? sql`${movements.availableAmount} > 0`
        : sql`${movements.availableAmount} = 0`,
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * By date, and within a day by the order the movements were recorded in, as
 * the owner's `Movimientos` tab reads them.
 */
function buildMovementsOrderBy(
  movements: EventMovements,
  order: MovementsListOrder,
) {
  const direction = order.direction === "asc" ? asc : desc;

  return [
    direction(movements.date),
    direction(movements.recordedAt),
    direction(movements.number),
    desc(movements.id),
  ];
}

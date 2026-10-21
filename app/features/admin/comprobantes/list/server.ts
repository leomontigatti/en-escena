import { and, asc, desc, eq, isNotNull, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { academies, choreographies, comprobantes, seminars } from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import type { ComprobanteAnchor } from "@/lib/comprobantes/anchor";
import { readAnchorFromJoins } from "@/lib/comprobantes/anchor-context.server";
import type { ComprobanteAnchorReading } from "@/lib/comprobantes/anchor-reading";
import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import {
  comprobanteStatusSql,
  type ComprobanteStatus,
} from "@/lib/comprobantes/comprobante-status.server";
import {
  comprobanteKindCbteTipo,
  comprobanteKinds,
  type KnownComprobanteKind,
} from "@/lib/comprobantes/kind";
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

import {
  comprobanteAnchorKindSearchValues,
  comprobanteStatusSearchValues,
  readComprobanteAnchorKindSearchValue,
  readComprobanteStatusSearchValue,
} from "./shared";

// A row of the global comprobantes list (#339 variant A, #483). It is read-only:
// it exposes the already emitted fiscal snapshot (numbering, CAE, amount, date)
// alongside its derived state, the academy and the anchor's reading — of either
// kind — for navigating to the unit's financial detail.
export type ComprobantesListRow = {
  id: string;
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  cbteFch: string;
  impTotal: number;
  cae: string;
  // `null` on a note or an unknown kind: only an invoice has a status.
  status: ComprobanteStatus | null;
  anchor: ComprobanteAnchorReading;
  academyId: string;
  academyName: string;
};

// Type facet: one option per known kind. The kind's own name travels as the
// URL value, so the filter is not coupled to the label.
export type ComprobanteKindFacet = KnownComprobanteKind;

export type ComprobantesListOrder = {
  columnId: "fecha" | "numero";
  direction: "asc" | "desc";
};

export type ComprobantesListFilters = {
  // The `Origen` facet: which kind of anchor the comprobante belongs to.
  anchorKind: ComprobanteAnchor["kind"] | null;
  kind: ComprobanteKindFacet | null;
  order: ComprobantesListOrder;
  page: number;
  query: string;
  status: ComprobanteStatus | null;
};

export type ComprobantesListLoaderData = {
  filters: ComprobantesListFilters;
  hasAnyComprobante: boolean;
  rows: ComprobantesListRow[];
  selectedEventId: string | null;
  totalCount: number;
  totalPages: number;
};

const comprobantesListSpec: ListQuerySpec<ComprobantesListOrder["columnId"]> = {
  orderColumnIds: ["fecha", "numero"],
  defaultOrder: { columnId: "fecha", direction: "desc" },
};

/**
 * The global list of comprobantes emitted in the active event, an academy's and
 * an individual's alike (ADR-0019: both own them through the same owner row),
 * paginated, sorted and filtered on the server (it grows over time, #483). A
 * invoice's status is NOT persisted: it is derived in SQL by
 * `comprobanteStatusSql`, the twin of the detail's derivation, so that the
 * state filter and the pagination operate on the real state and not on the
 * loaded page. It mutates nothing.
 */
export async function loadComprobantesList(
  request: Request,
): Promise<ComprobantesListLoaderData> {
  await requireAdminPanelWriter(request);
  const eventContext = await loadEventContext(request);
  const selectedEventId = eventContext.selectedEventId;
  const url = readRequestedUrl(request);
  const filters = readComprobantesListFilters(url.searchParams);

  if (selectedEventId === null) {
    return {
      filters,
      hasAnyComprobante: false,
      rows: [] as ComprobantesListRow[],
      selectedEventId: null,
      totalCount: 0,
      totalPages: 1,
    };
  }

  const status = comprobanteStatusSql();
  const where = buildComprobantesWhere(selectedEventId, filters, status);
  const [{ count: totalUnfilteredCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(comprobantes)
    .innerJoin(academies, eq(comprobantes.academyId, academies.id))
    .where(eq(comprobantes.eventId, selectedEventId));
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(comprobantes)
    .innerJoin(academies, eq(comprobantes.academyId, academies.id))
    .leftJoin(
      choreographies,
      eq(comprobantes.choreographyId, choreographies.id),
    )
    .leftJoin(seminars, eq(comprobantes.seminarId, seminars.id))
    .where(where);
  const totalCount = Number(count);
  const { limit, offset, page, totalPages } = paginateList({
    page: filters.page,
    pageSize: adminListPageSize,
    totalCount,
  });
  const normalizedFilters = { ...filters, page };

  const anchorRows = await db
    .select({
      id: comprobantes.id,
      cbteTipo: comprobantes.cbteTipo,
      ptoVta: comprobantes.ptoVta,
      cbteNro: comprobantes.cbteNro,
      cbteFch: comprobantes.cbteFch,
      impTotal: comprobantes.impTotal,
      cae: comprobantes.cae,
      status,
      // The two anchor columns with their joined readings: each row satisfies
      // exactly one of the LEFT joins, and the root's `CHECK` is what makes the
      // branch in `readAnchorFromJoins` total. The academy comes off the root's
      // own column, which every kind carries.
      choreographyId: comprobantes.choreographyId,
      choreographyName: choreographies.name,
      seminarId: comprobantes.seminarId,
      instructorName: seminars.instructorName,
      scheduledDate: seminars.scheduledDate,
      academyId: academies.id,
      academyName: academies.name,
    })
    .from(comprobantes)
    .innerJoin(academies, eq(comprobantes.academyId, academies.id))
    .leftJoin(
      choreographies,
      eq(comprobantes.choreographyId, choreographies.id),
    )
    .leftJoin(seminars, eq(comprobantes.seminarId, seminars.id))
    .where(where)
    .orderBy(...buildComprobantesOrderBy(normalizedFilters.order))
    .limit(limit)
    .offset(offset);

  const comprobanteRows: ComprobantesListRow[] = anchorRows.map(
    ({
      choreographyId,
      choreographyName,
      seminarId,
      instructorName,
      scheduledDate,
      ...row
    }) => ({
      ...row,
      anchor: readAnchorFromJoins({
        choreographyId,
        choreographyName,
        seminarId,
        instructorName,
        scheduledDate,
      }),
    }),
  );

  // Retired facets (`academia`, `porcion`) are not declared, so old URLs drop
  // them on the way.
  redirectToCanonicalListUrl(request, {
    facets: {
      estado:
        normalizedFilters.status === null
          ? null
          : comprobanteStatusSearchValues[normalizedFilters.status],
      tipo: normalizedFilters.kind,
      origen:
        normalizedFilters.anchorKind === null
          ? null
          : comprobanteAnchorKindSearchValues[normalizedFilters.anchorKind],
    },
    query: {
      order: normalizedFilters.order,
      page: normalizedFilters.page,
      search: normalizedFilters.query,
    },
    spec: comprobantesListSpec,
  });

  return {
    filters: normalizedFilters,
    hasAnyComprobante: Number(totalUnfilteredCount) > 0,
    rows: comprobanteRows,
    selectedEventId,
    totalCount,
    totalPages,
  };
}

function readComprobantesListFilters(
  searchParams: URLSearchParams,
): ComprobantesListFilters {
  const listQuery = readListQuery(searchParams, comprobantesListSpec);

  return {
    anchorKind: readComprobanteAnchorKindSearchValue(
      searchParams.get("origen"),
    ),
    kind: readKind(searchParams.get("tipo")),
    order: listQuery.order,
    page: listQuery.page,
    query: listQuery.search,
    status: readComprobanteStatusSearchValue(searchParams.get("estado")),
  };
}

function readKind(value: string | null): ComprobanteKindFacet | null {
  return comprobanteKinds.find((kind) => kind === value) ?? null;
}

function buildComprobantesWhere(
  selectedEventId: string,
  filters: ComprobantesListFilters,
  status: SQL<ComprobanteStatus | null>,
) {
  const conditions: SQL[] = [eq(comprobantes.eventId, selectedEventId)];
  // The two anchor readings: a choreography by name, a seminar by its
  // instructor's name, which is how a seminar is named at all. The fiscal
  // number `PPPP-NNNNNNNN` is reconstructed so it can be searched as the
  // operator sees it (the same format as `formatComprobanteNumber`).
  const searchCondition = listSearchCondition(filters.query, [
    academies.name,
    choreographies.name,
    seminars.instructorName,
    sql`lpad(cast(${comprobantes.ptoVta} as text), 4, '0') || '-' || lpad(cast(${comprobantes.cbteNro} as text), 8, '0')`,
  ]);

  if (searchCondition) {
    conditions.push(searchCondition);
  }

  if (filters.status !== null) {
    conditions.push(eq(status, filters.status));
  }

  if (filters.kind !== null) {
    conditions.push(
      eq(comprobantes.cbteTipo, comprobanteKindCbteTipo(filters.kind)),
    );
  }

  // The root's CHECK sets exactly one anchor column, so the one that is set
  // says the kind.
  if (filters.anchorKind === "choreography") {
    conditions.push(isNotNull(comprobantes.choreographyId));
  } else if (filters.anchorKind === "seminar") {
    conditions.push(isNotNull(comprobantes.seminarId));
  }

  return and(...conditions);
}

function buildComprobantesOrderBy(order: ComprobantesListOrder) {
  const direction = order.direction === "asc" ? asc : desc;

  if (order.columnId === "numero") {
    return [
      direction(comprobantes.ptoVta),
      direction(comprobantes.cbteNro),
      desc(comprobantes.id),
    ];
  }

  return [
    direction(comprobantes.cbteFch),
    direction(comprobantes.cbteNro),
    desc(comprobantes.id),
  ];
}

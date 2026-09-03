import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, choreographies, comprobantes } from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  FACTURA_C_CBTE_TIPO,
  NOTA_CREDITO_C_CBTE_TIPO,
} from "@/lib/comprobantes/arca/factura-c";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import type { ComprobanteStatus } from "@/lib/comprobantes/comprobante-status.server";

// A row of the global comprobantes list (#339 variant A, #483). It is read-only:
// it exposes the already emitted fiscal snapshot (numbering, CAE, amount, date)
// alongside its derived state and the anchor choreography/academy for navigating
// to the detail.
export type ComprobantesListRow = {
  id: string;
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  cbteFch: string;
  impTotal: number;
  cae: string;
  status: ComprobanteStatus;
  choreographyId: string;
  choreographyName: string;
  academyId: string;
  academyName: string;
};

// Type facet: only `Factura C` (11) and `Nota de crédito C` (13) are emitted. The
// value travels as a stable slug in the URL, so the filter is not coupled to the
// label.
export type ComprobanteTipoFacet = "factura_c" | "nota_credito_c";

export type ComprobantesListOrder = {
  columnId: "fecha" | "numero";
  direction: "asc" | "desc";
};

export type ComprobantesListFilters = {
  estado: ComprobanteStatus | null;
  order: ComprobantesListOrder;
  page: number;
  query: string;
  tipo: ComprobanteTipoFacet | null;
};

export type ComprobantesListLoaderData = {
  filters: ComprobantesListFilters;
  hasAnyComprobante: boolean;
  rows: ComprobantesListRow[];
  selectedEventId: string | null;
  totalCount: number;
  totalPages: number;
};

const comprobantesPageSize = 50;
const defaultComprobantesOrder: ComprobantesListOrder = {
  columnId: "fecha",
  direction: "desc",
};

/**
 * The global list of comprobantes emitted in the active event, paginated, sorted
 * and filtered on the server (it grows over time, #483). The `vigente`/`anulada`
 * state is NOT persisted: it is derived in SQL from the existence of a credit
 * note of the same event referencing the invoice via
 * `associatedComprobanteId`, so that the state filter and the pagination operate
 * on the real state and not on the loaded page. It mutates nothing.
 */
export async function loadComprobantesList(
  request: Request,
): Promise<ComprobantesListLoaderData> {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(request);
  const selectedEventId = eventContext.selectedEventId;
  const url = new URL(request.url);
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

  const isAnnulled = buildAnnulledExists(selectedEventId);
  const where = buildComprobantesWhere(selectedEventId, filters, isAnnulled);
  const [{ count: totalUnfilteredCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(comprobantes)
    .where(eq(comprobantes.eventId, selectedEventId));
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(comprobantes)
    .innerJoin(
      choreographies,
      eq(comprobantes.choreographyId, choreographies.id),
    )
    .innerJoin(academies, eq(choreographies.academyId, academies.id))
    .where(where);
  const totalCount = Number(count);
  const totalPages = Math.max(1, Math.ceil(totalCount / comprobantesPageSize));
  const page = Math.min(filters.page, totalPages);
  const normalizedFilters = { ...filters, page };

  const comprobanteRows = await db
    .select({
      id: comprobantes.id,
      cbteTipo: comprobantes.cbteTipo,
      ptoVta: comprobantes.ptoVta,
      cbteNro: comprobantes.cbteNro,
      cbteFch: comprobantes.cbteFch,
      impTotal: comprobantes.impTotal,
      cae: comprobantes.cae,
      status: sql<ComprobanteStatus>`case when ${isAnnulled} then 'anulada' else 'vigente' end`,
      choreographyId: comprobantes.choreographyId,
      choreographyName: choreographies.name,
      academyId: academies.id,
      academyName: academies.name,
    })
    .from(comprobantes)
    .innerJoin(
      choreographies,
      eq(comprobantes.choreographyId, choreographies.id),
    )
    .innerJoin(academies, eq(choreographies.academyId, academies.id))
    .where(where)
    .orderBy(...buildComprobantesOrderBy(normalizedFilters.order))
    .limit(comprobantesPageSize)
    .offset((page - 1) * comprobantesPageSize);

  const canonicalSearch = buildCanonicalComprobantesSearch({
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
    hasAnyComprobante: Number(totalUnfilteredCount) > 0,
    rows: comprobanteRows satisfies ComprobantesListRow[],
    selectedEventId,
    totalCount,
    totalPages,
  };
}

// Derived `anulada`: a credit note of the same event referencing this row
// exists. Correlated with the outer row via `associatedComprobanteId`.
function buildAnnulledExists(selectedEventId: string): SQL {
  const notaCredito = alias(comprobantes, "nota_credito");

  return exists(
    db
      .select({ one: sql`1` })
      .from(notaCredito)
      .where(
        and(
          eq(notaCredito.associatedComprobanteId, comprobantes.id),
          eq(notaCredito.eventId, selectedEventId),
        ),
      ),
  );
}

function readComprobantesListFilters(
  searchParams: URLSearchParams,
): ComprobantesListFilters {
  return {
    estado: readEstado(searchParams.get("estado")),
    order: readComprobantesOrder(searchParams.get("orden")),
    page: readPage(searchParams),
    query: searchParams.get("busqueda")?.trim() ?? "",
    tipo: readTipo(searchParams.get("tipo")),
  };
}

function readEstado(value: string | null): ComprobanteStatus | null {
  return value === "vigente" || value === "anulada" ? value : null;
}

function readTipo(value: string | null): ComprobanteTipoFacet | null {
  return value === "factura_c" || value === "nota_credito_c" ? value : null;
}

function readComprobantesOrder(value: string | null): ComprobantesListOrder {
  const [columnId, direction] = value?.split(":") ?? [];

  if (
    (columnId === "fecha" || columnId === "numero") &&
    (direction === "asc" || direction === "desc")
  ) {
    return { columnId, direction };
  }

  return defaultComprobantesOrder;
}

function readPage(searchParams: URLSearchParams) {
  const value = Number(searchParams.get("pagina"));

  return Number.isInteger(value) && value > 0 ? value : 1;
}

function buildComprobantesWhere(
  selectedEventId: string,
  filters: ComprobantesListFilters,
  isAnnulled: SQL,
) {
  const conditions: SQL[] = [eq(comprobantes.eventId, selectedEventId)];
  const query = filters.query.trim();

  if (query.length > 0) {
    conditions.push(
      or(
        ilike(academies.name, `%${query}%`),
        ilike(choreographies.name, `%${query}%`),
        // Fiscal number `PPPP-NNNNNNNN`, reconstructed so it can be searched as
        // the operator sees it (the same format as `formatComprobanteNumber`).
        ilike(
          sql`lpad(cast(${comprobantes.ptoVta} as text), 4, '0') || '-' || lpad(cast(${comprobantes.cbteNro} as text), 8, '0')`,
          `%${query}%`,
        ),
      )!,
    );
  }

  if (filters.estado === "anulada") {
    conditions.push(isAnnulled);
  } else if (filters.estado === "vigente") {
    conditions.push(not(isAnnulled));
  }

  if (filters.tipo !== null) {
    conditions.push(eq(comprobantes.cbteTipo, tipoToCbteTipo(filters.tipo)));
  }

  return and(...conditions);
}

function tipoToCbteTipo(tipo: ComprobanteTipoFacet): number {
  return tipo === "factura_c" ? FACTURA_C_CBTE_TIPO : NOTA_CREDITO_C_CBTE_TIPO;
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

function buildCanonicalComprobantesSearch(input: {
  currentSearch: string;
  filters: ComprobantesListFilters;
}) {
  const searchParams = new URLSearchParams(input.currentSearch);

  if (input.filters.query.length > 0) {
    searchParams.set("busqueda", input.filters.query);
  } else {
    searchParams.delete("busqueda");
  }

  if (input.filters.estado !== null) {
    searchParams.set("estado", input.filters.estado);
  } else {
    searchParams.delete("estado");
  }

  if (input.filters.tipo !== null) {
    searchParams.set("tipo", input.filters.tipo);
  } else {
    searchParams.delete("tipo");
  }

  // Retired facets (ADR-0011): they are stripped from old URLs.
  searchParams.delete("academia");
  searchParams.delete("porcion");

  if (
    input.filters.order.columnId === defaultComprobantesOrder.columnId &&
    input.filters.order.direction === defaultComprobantesOrder.direction
  ) {
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

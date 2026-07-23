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
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  FACTURA_C_CBTE_TIPO,
  NOTA_CREDITO_C_CBTE_TIPO,
} from "@/lib/comprobantes/arca/factura-c";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import type { ComprobanteStatus } from "@/lib/comprobantes/comprobante-status.server";
import type { ComprobantePorcion } from "@/lib/comprobantes/emit-factura-c.server";

// Fila de la lista global de comprobantes (#339 variante A, #483). Es de sólo
// lectura: expone el snapshot fiscal ya emitido (numeración, CAE, importe, fecha)
// junto a su estado derivado y la coreografía/academia ancla para navegar al
// detalle.
export type AdminComprobanteRow = {
  id: string;
  cbteTipo: number;
  ptoVta: number;
  cbteNro: number;
  cbteFch: string;
  impTotal: number;
  cae: string;
  porcion: ComprobantePorcion;
  status: ComprobanteStatus;
  choreographyId: string;
  choreographyName: string;
  academyId: string;
  academyName: string;
};

// Faceta de tipo: sólo se emiten Factura C (11) y Nota de crédito C (13). El
// valor viaja como slug estable en la URL para no acoplar el filtro al label.
export type AdminComprobanteTipoFacet = "factura_c" | "nota_credito_c";

export type AdminComprobantesListOrder = {
  columnId: "fecha" | "numero";
  direction: "asc" | "desc";
};

export type AdminComprobantesListFilters = {
  estado: ComprobanteStatus | null;
  order: AdminComprobantesListOrder;
  page: number;
  query: string;
  tipo: AdminComprobanteTipoFacet | null;
};

export type AdminComprobantesListLoaderData = {
  filters: AdminComprobantesListFilters;
  hasAnyComprobante: boolean;
  rows: AdminComprobanteRow[];
  selectedEventId: string | null;
  totalCount: number;
  totalPages: number;
};

const adminComprobantesPageSize = 50;
const defaultAdminComprobantesOrder: AdminComprobantesListOrder = {
  columnId: "fecha",
  direction: "desc",
};

/**
 * Lista global de comprobantes emitidos en el evento activo, paginada, ordenada y
 * filtrada del lado del servidor (crece con el tiempo, #483). El estado
 * `vigente`/`anulada` NO se persiste: se deriva en SQL de la existencia de una
 * Nota de crédito del mismo evento que referencie la factura vía
 * `associatedComprobanteId`, así el filtro por estado y la paginación operan sobre
 * el estado real y no sobre la página cargada. NO muta nada.
 */
export async function loadAdminComprobantesList(
  request: Request,
): Promise<AdminComprobantesListLoaderData> {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);
  const selectedEventId = eventContext.selectedEventId;
  const url = new URL(request.url);
  const filters = readAdminComprobantesListFilters(url.searchParams);

  if (selectedEventId === null) {
    return {
      filters,
      hasAnyComprobante: false,
      rows: [] as AdminComprobanteRow[],
      selectedEventId: null,
      totalCount: 0,
      totalPages: 1,
    };
  }

  const isAnnulled = buildAnnulledExists(selectedEventId);
  const where = buildAdminComprobantesWhere(
    selectedEventId,
    filters,
    isAnnulled,
  );
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
  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / adminComprobantesPageSize),
  );
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
      porcion: comprobantes.porcion,
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
    .orderBy(...buildAdminComprobantesOrderBy(normalizedFilters.order))
    .limit(adminComprobantesPageSize)
    .offset((page - 1) * adminComprobantesPageSize);

  const canonicalSearch = buildCanonicalAdminComprobantesSearch({
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
    rows: comprobanteRows satisfies AdminComprobanteRow[],
    selectedEventId,
    totalCount,
    totalPages,
  };
}

// `anulada` derivada: existe una Nota de crédito del mismo evento que referencia
// esta fila. Correlacionada con la fila externa vía `associatedComprobanteId`.
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

function readAdminComprobantesListFilters(
  searchParams: URLSearchParams,
): AdminComprobantesListFilters {
  return {
    estado: readEstado(searchParams.get("estado")),
    order: readAdminComprobantesOrder(searchParams.get("orden")),
    page: readPage(searchParams),
    query: searchParams.get("busqueda")?.trim() ?? "",
    tipo: readTipo(searchParams.get("tipo")),
  };
}

function readEstado(value: string | null): ComprobanteStatus | null {
  return value === "vigente" || value === "anulada" ? value : null;
}

function readTipo(value: string | null): AdminComprobanteTipoFacet | null {
  return value === "factura_c" || value === "nota_credito_c" ? value : null;
}

function readAdminComprobantesOrder(
  value: string | null,
): AdminComprobantesListOrder {
  const [columnId, direction] = value?.split(":") ?? [];

  if (
    (columnId === "fecha" || columnId === "numero") &&
    (direction === "asc" || direction === "desc")
  ) {
    return { columnId, direction };
  }

  return defaultAdminComprobantesOrder;
}

function readPage(searchParams: URLSearchParams) {
  const value = Number(searchParams.get("pagina"));

  return Number.isInteger(value) && value > 0 ? value : 1;
}

function buildAdminComprobantesWhere(
  selectedEventId: string,
  filters: AdminComprobantesListFilters,
  isAnnulled: SQL,
) {
  const conditions: SQL[] = [eq(comprobantes.eventId, selectedEventId)];
  const query = filters.query.trim();

  if (query.length > 0) {
    conditions.push(
      or(
        ilike(academies.name, `%${query}%`),
        ilike(choreographies.name, `%${query}%`),
        // Número fiscal `PPPP-NNNNNNNN`, reconstruido para buscarlo como lo ve la
        // operadora (mismo formato que `formatComprobanteNumber`).
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

function tipoToCbteTipo(tipo: AdminComprobanteTipoFacet): number {
  return tipo === "factura_c" ? FACTURA_C_CBTE_TIPO : NOTA_CREDITO_C_CBTE_TIPO;
}

function buildAdminComprobantesOrderBy(order: AdminComprobantesListOrder) {
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

function buildCanonicalAdminComprobantesSearch(input: {
  currentSearch: string;
  filters: AdminComprobantesListFilters;
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

  // Facetas retiradas (ADR-0011): se limpian de URLs viejas.
  searchParams.delete("academia");
  searchParams.delete("porcion");

  if (
    input.filters.order.columnId === defaultAdminComprobantesOrder.columnId &&
    input.filters.order.direction === defaultAdminComprobantesOrder.direction
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

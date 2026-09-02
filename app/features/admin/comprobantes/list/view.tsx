import { ReceiptText } from "lucide-react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ServerDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import type { DataTableFacetedFilterValue } from "@/components/shared/data-table.shared";
import { Badge } from "@/components/ui/badge";
import { formatAmount } from "@/lib/finances/formatters";
import {
  FACTURA_C_CBTE_TIPO,
  NOTA_CREDITO_C_CBTE_TIPO,
} from "@/lib/comprobantes/arca/factura-c";
import {
  comprobanteTipoBadgeVariant,
  formatComprobanteArcaDate,
  formatComprobanteNumber,
  formatComprobanteStatusLabel,
  formatComprobanteTipoInitials,
  formatComprobanteTipoLabel,
} from "@/lib/comprobantes/format";

import type { ComprobantesListRow, ComprobantesListLoaderData } from "./server";

type ComprobantesListRouteViewProps = {
  loaderData: ComprobantesListLoaderData;
};

// A read-only global list, paginated/sorted/filtered on the server (ADR-0011,
// #483). Fixed column order:
// `# · Tipo · Academia · Coreografía · Estado · Fecha · Importe`. Only
// `Comprobante` (the number) and `Fecha` are sortable (`sortValue` enables the
// header). The number links to the comprobante detail and the choreography to
// its financial detail; there is no CAE column and no inline actions
// (print/annul live in the detail).
export const comprobanteColumns: DataTableColumn<ComprobantesListRow>[] = [
  {
    id: "numero",
    header: "Comprobante",
    className: "font-medium tabular-nums",
    cell: (row) => (
      <DataTableLink to={`/administracion/comprobantes/${row.id}`}>
        {formatComprobanteNumber(row)}
      </DataTableLink>
    ),
    sortValue: (row) => `${row.ptoVta}-${String(row.cbteNro).padStart(8, "0")}`,
  },
  {
    id: "tipo",
    header: "Tipo",
    cell: (row) => (
      <Badge
        variant={comprobanteTipoBadgeVariant(row.cbteTipo)}
        title={formatComprobanteTipoLabel(row.cbteTipo)}
      >
        {formatComprobanteTipoInitials(row.cbteTipo)}
      </Badge>
    ),
  },
  {
    id: "academia",
    header: "Academia",
    className: "text-muted-foreground",
    cell: (row) => row.academyName,
  },
  {
    id: "coreografia",
    header: "Coreografía",
    className: "text-muted-foreground",
    cell: (row) => (
      <DataTableLink
        to={`/administracion/finanzas/${row.academyId}/coreografias/${row.choreographyId}`}
      >
        {row.choreographyName}
      </DataTableLink>
    ),
  },
  {
    id: "estado",
    header: "Estado",
    cell: (row) => (
      <Badge variant={row.status === "vigente" ? "success" : "destructive"}>
        {formatComprobanteStatusLabel(row.status)}
      </Badge>
    ),
  },
  {
    id: "fecha",
    header: "Fecha",
    className: "tabular-nums",
    cell: (row) => formatComprobanteArcaDate(row.cbteFch),
    sortValue: (row) => row.cbteFch,
  },
  {
    id: "importe",
    header: "Importe",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.impTotal),
  },
];

export const comprobanteFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "estado",
    label: "Estado",
    options: [
      { label: "Vigente", value: "vigente" },
      { label: "Anulada", value: "anulada" },
    ],
  },
  {
    id: "tipo",
    label: "Tipo",
    options: [
      {
        label: formatComprobanteTipoLabel(FACTURA_C_CBTE_TIPO),
        value: "factura_c",
      },
      {
        label: formatComprobanteTipoLabel(NOTA_CREDITO_C_CBTE_TIPO),
        value: "nota_credito_c",
      },
    ],
  },
];

export function ComprobantesListRouteView({
  loaderData,
}: ComprobantesListRouteViewProps) {
  const shouldShowTable =
    loaderData.rows.length > 0 ||
    loaderData.hasAnyComprobante ||
    loaderData.filters.query.length > 0 ||
    loaderData.filters.estado !== null ||
    loaderData.filters.tipo !== null ||
    loaderData.filters.page > 1 ||
    loaderData.filters.order.columnId !== "fecha" ||
    loaderData.filters.order.direction !== "desc";

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Comprobantes"
      description="Revisá los comprobantes electrónicos emitidos para el evento activo y su estado fiscal."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar comprobantes",
        description:
          "Activá un evento para consultar los comprobantes emitidos por administración.",
      }}
    >
      {shouldShowTable ? (
        <ServerDataTable
          rows={loaderData.rows}
          columns={comprobanteColumns}
          pageParamName="pagina"
          searchParamName="busqueda"
          sortParamName="orden"
          facetedFilters={comprobanteFacetedFilters}
          initialFacetedFilterValues={buildInitialFacetedFilterValues(
            loaderData,
          )}
          initialSearchValue={loaderData.filters.query}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar por academia, coreografía o número"
          initialSort={loaderData.filters.order}
          emptyMessage="No hay comprobantes que coincidan con la búsqueda o los filtros."
          currentPage={loaderData.filters.page}
          totalPages={loaderData.totalPages}
          totalRows={loaderData.totalCount}
        />
      ) : (
        <AdminEmptyState
          icon={ReceiptText}
          title="Todavía no hay comprobantes emitidos."
          description="Cuando administración emita comprobantes para el evento activo, van a aparecer acá."
        />
      )}
    </AdminResourceLayout>
  );
}

function buildInitialFacetedFilterValues(
  loaderData: ComprobantesListLoaderData,
): Record<string, DataTableFacetedFilterValue> {
  const filters: DataTableFacetedFilterValue = {};

  if (loaderData.filters.estado !== null) {
    filters.estado = loaderData.filters.estado;
  }

  if (loaderData.filters.tipo !== null) {
    filters.tipo = loaderData.filters.tipo;
  }

  return {
    filters,
  };
}

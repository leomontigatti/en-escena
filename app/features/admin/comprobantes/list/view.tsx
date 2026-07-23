import { ReceiptText } from "lucide-react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { formatAmount } from "@/features/admin/academies/account-current/formatters";
import {
  FACTURA_C_CBTE_TIPO,
  NOTA_CREDITO_C_CBTE_TIPO,
} from "@/lib/comprobantes/arca/factura-c";
import {
  formatComprobanteArcaDate,
  formatComprobanteNumber,
  formatComprobantePorcionLabel,
  formatComprobanteStatusLabel,
  formatComprobanteTipoLabel,
} from "@/lib/comprobantes/format";

import type {
  AdminComprobanteRow,
  AdminComprobantesListLoaderData,
} from "./server";

type AdministracionComprobantesRouteViewProps = {
  loaderData: AdminComprobantesListLoaderData;
};

// Lista global de solo lectura (ADR-0011, #483). Orden fijo:
// `# · Tipo · Academia · Coreografía · Estado · Fecha · Importe`. El número
// enlaza al detalle del comprobante y la coreografía a su detalle financiero;
// no hay columna CAE ni acciones inline (imprimir/anular viven en el detalle).
// La porción es faceta, no columna: se expone en una columna oculta para
// alimentar el filtro sin ocupar espacio en la grilla.
export const comprobanteColumns: DataTableColumn<AdminComprobanteRow>[] = [
  {
    id: "numero",
    header: "Comprobante",
    className: "font-medium tabular-nums",
    cell: (row) => (
      <DataTableLink to={`/administracion/comprobantes/${row.id}`}>
        {formatComprobanteNumber(row)}
      </DataTableLink>
    ),
    filterValue: (row) => formatComprobanteNumber(row),
    sortValue: (row) => `${row.ptoVta}-${String(row.cbteNro).padStart(8, "0")}`,
  },
  {
    id: "tipo",
    header: "Tipo",
    cell: (row) => (
      <Badge
        variant={row.cbteTipo === FACTURA_C_CBTE_TIPO ? "outline" : "info"}
      >
        {formatComprobanteTipoLabel(row.cbteTipo)}
      </Badge>
    ),
    filterValue: (row) => formatComprobanteTipoLabel(row.cbteTipo),
  },
  {
    id: "academia",
    header: "Academia",
    className: "text-muted-foreground",
    cell: (row) => row.academyName,
    filterValue: (row) => row.academyName,
    sortValue: (row) => row.academyName,
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
    filterValue: (row) => row.choreographyName,
    sortValue: (row) => row.choreographyName,
  },
  {
    id: "estado",
    header: "Estado",
    cell: (row) => (
      <Badge variant={row.status === "vigente" ? "success" : "destructive"}>
        {formatComprobanteStatusLabel(row.status)}
      </Badge>
    ),
    filterValue: (row) => row.status,
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
    sortValue: (row) => row.impTotal,
  },
  {
    id: "porcion",
    header: "Porción",
    hidden: true,
    cell: () => null,
    filterValue: (row) => formatComprobantePorcionLabel(row.porcion),
  },
];

const comprobanteEstadoFacetOptions = [
  { label: "Vigente", value: "vigente" },
  { label: "Anulada", value: "anulada" },
];

const comprobanteTipoFacetOptions = [
  {
    label: formatComprobanteTipoLabel(FACTURA_C_CBTE_TIPO),
    value: formatComprobanteTipoLabel(FACTURA_C_CBTE_TIPO),
  },
  {
    label: formatComprobanteTipoLabel(NOTA_CREDITO_C_CBTE_TIPO),
    value: formatComprobanteTipoLabel(NOTA_CREDITO_C_CBTE_TIPO),
  },
];

const comprobantePorcionFacetOptions = (
  ["seña", "saldo", "total"] as const
).map((porcion) => ({
  label: formatComprobantePorcionLabel(porcion),
  value: formatComprobantePorcionLabel(porcion),
}));

export function buildComprobanteFacetedFilters(
  loaderData: AdminComprobantesListLoaderData,
): DataTableFacetedFilter[] {
  return [
    {
      id: "estado",
      label: "Estado",
      options: comprobanteEstadoFacetOptions,
    },
    {
      id: "tipo",
      label: "Tipo",
      options: comprobanteTipoFacetOptions,
    },
    {
      id: "academia",
      label: "Academia",
      options: loaderData.academyFacetOptions,
    },
    {
      id: "porcion",
      label: "Porción",
      options: comprobantePorcionFacetOptions,
    },
  ];
}

export function AdministracionComprobantesRouteView({
  loaderData,
}: AdministracionComprobantesRouteViewProps) {
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
      {loaderData.rows.length > 0 ? (
        <ClientDataTable
          rows={loaderData.rows}
          columns={comprobanteColumns}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar por número, coreografía o academia"
          facetedFilters={buildComprobanteFacetedFilters(loaderData)}
          initialSort={{ columnId: "fecha", direction: "desc" }}
          emptyMessage="No hay comprobantes que coincidan con la búsqueda o los filtros."
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

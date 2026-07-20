/**
 * PROTOTIPO #339 — lista global de comprobantes (variante elegida: tabla plana
 * estilo Pagos).
 *
 * Vista nueva navegable desde el navbar (debajo de "Pagos"): el admin ve todas
 * las facturas y notas de crédito emitidas, con búsqueda y filtros por estado,
 * tipo y porción. Datos stub. Throwaway.
 */

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";

import {
  buildComprobanteList,
  deriveDisplayEstado,
  DisplayEstadoBadge,
  estadoFilterOptions,
  formatAmount,
  formatComprobanteDate,
  formatComprobanteNumero,
  porcionFilterOptions,
  tipoFilterOptions,
  TipoBadge,
} from "./stub";

type Row = ReturnType<typeof buildComprobanteList>[number];

export function ComprobantesListPrototype() {
  const rows = buildComprobanteList();
  const columns: DataTableColumn<Row>[] = [
    {
      id: "numero",
      header: "#",
      className: "font-medium tabular-nums",
      cell: (r) => formatComprobanteNumero(r.ptoVta, r.cbteNro),
      filterValue: (r) => `${r.academyName} ${r.choreographyName} ${r.cbteNro}`,
    },
    {
      id: "tipo",
      header: "Tipo",
      cell: (r) => <TipoBadge tipo={r.tipoComprobante} short />,
      filterValues: (r) => [r.tipoComprobante],
    },
    {
      id: "academia",
      header: "Academia",
      className: "text-muted-foreground",
      cell: (r) => r.academyName,
    },
    {
      id: "coreografia",
      header: "Coreografía",
      className: "text-muted-foreground",
      cell: (r) => r.choreographyName,
    },
    {
      id: "estado",
      header: "Estado",
      cell: (r) => <DisplayEstadoBadge estado={deriveDisplayEstado(r)} />,
      filterValues: (r) => [deriveDisplayEstado(r)],
    },
    {
      id: "fecha",
      header: "Fecha",
      cell: (r) => formatComprobanteDate(r.fechaEmision),
      sortValue: (r) => r.fechaEmision,
    },
    {
      id: "importe",
      header: "Importe",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (r) => formatAmount(r.impTotalSnapshot),
    },
    // Columna oculta: alimenta el filtro por porción sin mostrarse.
    {
      id: "porcion",
      header: "Porción",
      hidden: true,
      cell: () => null,
      filterValues: (r) => [r.porcion],
    },
  ];
  const facetedFilters: DataTableFacetedFilter[] = [
    { id: "estado", label: "Estado", options: [...estadoFilterOptions] },
    { id: "tipo", label: "Tipo", options: [...tipoFilterOptions] },
    { id: "porcion", label: "Porción", options: [...porcionFilterOptions] },
  ];
  return (
    <AdminResourceLayout
      selectedEventId="proto"
      title="Comprobantes"
      description="Consultá todas las facturas y notas de crédito emitidas a ARCA."
    >
      <ClientDataTable
        rows={rows}
        columns={columns}
        getRowKey={(r) => r.id}
        facetedFilters={facetedFilters}
        searchPlaceholder="Buscar por academia, coreografía o número"
        emptyMessage="No hay comprobantes emitidos."
      />
    </AdminResourceLayout>
  );
}

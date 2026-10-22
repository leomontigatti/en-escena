import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import {
  formatComprobanteArcaDate,
  formatComprobanteNumber,
} from "@/lib/comprobantes/format";
import {
  comprobanteKindBadgeVariant,
  formatComprobanteKindInitials,
  formatComprobanteKindLabel,
  signedComprobanteAmount,
} from "@/lib/comprobantes/kind";
import { formatAmount } from "@/lib/finances/formatters";
import type { AssociatedComprobante } from "@/lib/comprobantes/association";

/**
 * The comprobantes of one unit, or the notes that adjust one invoice: few
 * enough that there is nothing to search or page through. Each row opens the
 * comprobante's detail.
 */
export function ComprobantesTable({ rows }: { rows: AssociatedComprobante[] }) {
  return (
    <ClientDataTable
      rows={rows}
      columns={comprobanteColumns}
      getRowKey={(row) => row.id}
      searchPlaceholder="Buscar comprobantes"
      hideSearch
      hidePagination
      emptyMessage="No hay comprobantes para mostrar."
    />
  );
}

// No status column: the comprobante's detail, one click away, carries it.
const comprobanteColumns: DataTableColumn<AssociatedComprobante>[] = [
  {
    id: "numero",
    header: "N.°",
    width: 30,
    className: "font-medium tabular-nums",
    cell: (row) => (
      <DataTableLink recordTitle to={`/administracion/comprobantes/${row.id}`}>
        {formatComprobanteNumber(row)}
      </DataTableLink>
    ),
  },
  {
    id: "tipo",
    header: "Tipo",
    width: 20,
    cell: (row) => (
      <Badge
        variant={comprobanteKindBadgeVariant(row.cbteTipo)}
        title={formatComprobanteKindLabel(row.cbteTipo)}
      >
        {formatComprobanteKindInitials(row.cbteTipo)}
      </Badge>
    ),
  },
  {
    id: "fecha",
    header: "Fecha",
    width: 25,
    className: "tabular-nums",
    cell: (row) => formatComprobanteArcaDate(row.cbteFch),
  },
  {
    id: "importe",
    header: "Importe",
    width: 25,
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    // A credit note takes off what the invoice billed, so it reads negative
    // and the column reads as what the unit is invoiced for.
    cell: (row) => formatAmount(signedComprobanteAmount(row)),
  },
];

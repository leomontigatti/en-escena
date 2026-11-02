import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatAmount, formatDate } from "@/lib/finances/formatters";
import {
  getMovementKindBadgeVariant,
  movementDetailPath,
  movementKindLabels,
} from "@/lib/finances/movement-kinds";
import type { OwnerEventMovement } from "@/lib/finances/owner-event-movements.server";
import {
  formatPaymentMethodLabel,
  getPaymentMethodBadgeVariant,
} from "@/lib/finances/payment-methods";

/**
 * The `Movimientos` tab of an owner's finance page: its payments and refunds
 * in the active event, newest first, never its allocations. A movement's number
 * opens its page, where it is corrected.
 */
export function OwnerMovementsTab({
  movements,
}: {
  movements: OwnerEventMovement[];
}) {
  return (
    <ClientDataTable
      rows={movements}
      columns={ownerMovementColumns}
      getRowKey={(row) => `${row.kind}:${row.id}`}
      searchPlaceholder="Buscar por número o referencia"
      textFilterColumnId="reference"
      pageSize={25}
      emptyMessage="No hay movimientos para mostrar."
    />
  );
}

const ownerMovementColumns: DataTableColumn<OwnerEventMovement>[] = [
  {
    id: "kind",
    header: "Tipo",
    cell: (row) => (
      <Badge variant={getMovementKindBadgeVariant(row.kind)}>
        {movementKindLabels[row.kind]}
      </Badge>
    ),
  },
  {
    id: "number",
    header: "#",
    className: "font-medium tabular-nums",
    // Each kind counts in its own series, so a number is only read beside
    // its kind.
    cell: (row) => (
      <DataTableLink recordTitle to={movementDetailPath(row)}>
        {formatEventSequenceNumber(row.number)}
      </DataTableLink>
    ),
  },
  {
    id: "date",
    header: "Fecha",
    cell: (row) => formatDate(row.date),
  },
  {
    id: "reference",
    header: "Referencia",
    className: "min-w-56 text-muted-foreground",
    cell: (row) => row.reference ?? "",
    // The padded form also holds the raw number, so `42` matches as `00042` does.
    filterValue: (row) =>
      `${row.reference ?? ""} ${formatEventSequenceNumber(row.number)}`,
  },
  {
    id: "method",
    header: "Medio",
    cell: (row) => (
      <Badge variant={getPaymentMethodBadgeVariant(row.method)}>
        {formatPaymentMethodLabel(row.method)}
      </Badge>
    ),
  },
  {
    id: "amount",
    header: "Monto",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.amount),
  },
];

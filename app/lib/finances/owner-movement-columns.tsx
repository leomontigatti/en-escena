import type {
  DataTableColumn,
  DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatAmount, formatDate } from "@/lib/finances/formatters";
import {
  getMovementKindBadgeVariant,
  movementKindLabels,
} from "@/lib/finances/movement-kinds";
import type { OwnerEventMovement } from "@/lib/finances/owner-event-movements.server";
import {
  formatPaymentMethodLabel,
  getPaymentMethodBadgeVariant,
  paymentMethodOptions,
  paymentMethodValues,
} from "@/lib/finances/payment-methods";

export const ownerMovementFacetedFilterIds = ["medio"] as const;

/**
 * The payments and refunds an owner reads of itself —an academy in the
 * portal, an individual in its own area (ADR-0019)—: the same list on both,
 * read-only, since administration is the one that records them.
 */
export const ownerMovementFacetedFilters: DataTableFacetedFiltersOf<
  typeof ownerMovementFacetedFilterIds
> = [
  {
    id: "medio",
    label: "Medio de pago",
    options: [...paymentMethodOptions],
    renderValue: (option) => {
      const method = paymentMethodValues.find(
        (value) => value === option.value,
      );

      return method ? (
        <Badge variant={getPaymentMethodBadgeVariant(method)}>
          {option.label}
        </Badge>
      ) : (
        option.label
      );
    },
  },
];

export const ownerMovementColumns: DataTableColumn<OwnerEventMovement>[] = [
  {
    id: "kind",
    header: "Tipo",
    cell: (row) => <MovementKindBadge row={row} />,
  },
  {
    id: "number",
    header: "#",
    className: "font-medium tabular-nums",
    // Each kind counts in its own series, so a number is only read beside
    // its kind.
    cell: (row) => formatEventSequenceNumber(row.number),
  },
  {
    id: "date",
    header: "Fecha",
    cell: (row) => formatDate(row.date),
    sortValue: (row) => row.date,
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
    filterValue: (row) => row.method,
  },
  {
    id: "amount",
    header: "Monto",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.amount),
  },
];

function MovementKindBadge({ row }: { row: OwnerEventMovement }) {
  return (
    <Badge variant={getMovementKindBadgeVariant(row.kind)}>
      {movementKindLabels[row.kind]}
    </Badge>
  );
}

/**
 * A movement on a phone (style guide, "Tables and lists"): its kind, number
 * and amount first, then when, how and the reference, which is left out when
 * there is none.
 */
export function OwnerMovementCard({ row }: { row: OwnerEventMovement }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2">
          <MovementKindBadge row={row} />
          <span className="font-medium tabular-nums">
            {formatEventSequenceNumber(row.number)}
          </span>
        </span>
        <span className="text-sm font-medium tabular-nums">
          {formatAmount(row.amount)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{formatDate(row.date)}</span>
        <Badge variant={getPaymentMethodBadgeVariant(row.method)}>
          {formatPaymentMethodLabel(row.method)}
        </Badge>
      </div>
      {row.reference ? (
        <p className="text-sm wrap-break-word text-muted-foreground">
          {row.reference}
        </p>
      ) : null}
    </>
  );
}

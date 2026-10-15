import type {
  DataTableColumn,
  DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatAmount, formatDate } from "@/lib/finances/formatters";
import type { readOwnerEventPayments } from "@/lib/finances/owner-event-payments.server";
import {
  formatPaymentMethodLabel,
  getPaymentMethodBadgeVariant,
  paymentMethodOptions,
  paymentMethodValues,
} from "@/lib/finances/payment-methods";

export type OwnerPaymentRow = Awaited<
  ReturnType<typeof readOwnerEventPayments>
>[number];

export const ownerPaymentFacetedFilterIds = ["medio"] as const;

/**
 * The payments an owner reads of itself —an academy in the portal, an
 * individual in its own area (ADR-0019)—: the same list on both, read-only,
 * since administration is the one that records them.
 */
export const ownerPaymentFacetedFilters: DataTableFacetedFiltersOf<
  typeof ownerPaymentFacetedFilterIds
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

export const ownerPaymentColumns: DataTableColumn<OwnerPaymentRow>[] = [
  {
    id: "paymentNumber",
    header: "#",
    className: "font-medium tabular-nums",
    cell: (row) => formatEventSequenceNumber(row.paymentNumber),
  },
  {
    id: "paymentDate",
    header: "Fecha",
    cell: (row) => formatDate(row.paymentDate),
    sortValue: (row) => row.paymentDate,
  },
  {
    id: "reference",
    header: "Referencia",
    className: "min-w-56 text-muted-foreground",
    cell: (row) => row.reference ?? "",
    // The padded form also holds the raw number, so `42` matches as `00042` does.
    filterValue: (row) =>
      `${row.reference ?? ""} ${formatEventSequenceNumber(row.paymentNumber)}`,
  },
  {
    id: "paymentMethod",
    header: "Medio de pago",
    cell: (row) => (
      <Badge variant={getPaymentMethodBadgeVariant(row.paymentMethod)}>
        {formatPaymentMethodLabel(row.paymentMethod)}
      </Badge>
    ),
    filterValue: (row) => row.paymentMethod,
  },
  {
    id: "amount",
    header: "Monto",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.amount),
  },
];

/**
 * A payment on a phone (style guide, "Tables and lists"): its number and
 * amount first, then when, how and the reference, which is left out when
 * there is none.
 */
export function OwnerPaymentCard({ row }: { row: OwnerPaymentRow }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium tabular-nums">
          {formatEventSequenceNumber(row.paymentNumber)}
        </span>
        <span className="text-sm font-medium tabular-nums">
          {formatAmount(row.amount)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {formatDate(row.paymentDate)}
        </span>
        <Badge variant={getPaymentMethodBadgeVariant(row.paymentMethod)}>
          {formatPaymentMethodLabel(row.paymentMethod)}
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

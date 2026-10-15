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

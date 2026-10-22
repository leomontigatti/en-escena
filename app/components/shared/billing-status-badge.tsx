import type { DataTableFacetedFilter } from "@/components/shared/data-table.shared";
import { FinancialStatusBadge } from "@/components/shared/financial-status-badge";
import { Badge } from "@/components/ui/badge";
import type { BillingStatus } from "@/lib/comprobantes/anchor-billing";
import type { InscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";

// The comprobante axis of an `Estado` (ADR-0014 §5, #657), the second badge
// beside the payment one and never in its place: a unit can be `Pagada` and
// still owe a note. Administration only — the academy is told nothing when
// its bill moves (ADR-0014 §10). It appears once the unit has its invoice;
// the amount and the 15-day clock live in the detail's alert.

const billingStatusLabels = {
  invoiced: "Facturada",
  pendingDebitNote: "ND pendiente",
  pendingCreditNote: "NC pendiente",
} as const satisfies Record<BillingStatus, string>;

// Green when the documents add up, red when a note is owed.
const billingStatusVariants = {
  invoiced: "success",
  pendingDebitNote: "destructive",
  pendingCreditNote: "destructive",
} as const satisfies Record<BillingStatus, string>;

function BillingStatusBadge({
  status,
}: {
  status: BillingStatus | null | undefined;
}) {
  if (!status) {
    return null;
  }

  return (
    <Badge variant={billingStatusVariants[status]}>
      {billingStatusLabels[status]}
    </Badge>
  );
}

/**
 * An `Estado`'s two axes side by side, payment first: the one owner of their
 * order and spacing on the lists, the detail headers and the inscription rows.
 */
export function PaymentAndBillingBadges({
  billingStatus,
  status,
}: {
  billingStatus: BillingStatus | null | undefined;
  status: InscriptionStatusBadge;
}) {
  return (
    <span className="flex items-center gap-2">
      <FinancialStatusBadge status={status} />
      <BillingStatusBadge status={billingStatus} />
    </span>
  );
}

// The `Facturación` facet's values are the badge's keys, so the filter and
// the cell cannot disagree.
export const billingFacetId = "facturacion";

const billingStatuses = [
  "invoiced",
  "pendingDebitNote",
  "pendingCreditNote",
] as const satisfies readonly BillingStatus[];

/** The same facet over units and over their inscriptions. */
export const billingFacet: DataTableFacetedFilter<typeof billingFacetId> = {
  id: billingFacetId,
  label: "Facturación",
  options: billingStatuses.map((status) => ({
    label: billingStatusLabels[status],
    value: status,
  })),
  renderValue: (option) => (
    <BillingStatusBadge
      status={billingStatuses.find((status) => status === option.value)}
    />
  ),
};

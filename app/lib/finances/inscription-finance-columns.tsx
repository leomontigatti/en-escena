import {
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import {
  formatInscriptionStatusBadge,
  inscriptionStatusFilterOptions,
} from "@/lib/finances/choreography-financial-status";
import {
  resolveInscriptionStatusBadge,
  type InscriptionAnomaly,
  type InscriptionFinancialStatus,
} from "@/lib/finances/inscription-financial-status";

import { formatAmount } from "@/lib/finances/formatters";

/**
 * The money half of an inscription row, which is the half the administrator and
 * the academy read identically: the same five columns, the same decoration and
 * the same badge on both financial details.
 *
 * Only the `Bailarín` column is built per screen, because it is the only one
 * that is not a reading: for the administrator it opens the money dialog, and
 * for the academy it is plain text. Everything after it lives here so the two
 * screens cannot drift into showing the same figure two ways.
 */
export type InscriptionFinanceRow = {
  allocatedAmount: number;
  anomalies: InscriptionAnomaly[];
  depositAmount: number | null;
  effectivePrice: { name: string } | null;
  financialStatus: InscriptionFinancialStatus;
  owedBalanceAmount: number | null;
  totalAmount: number | null;
  withdrawn: boolean;
};

/** The `Estado` facet, whose options are the badges the column renders. */
export const inscriptionFinanceFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "estado",
    label: "Estado",
    options: [...inscriptionStatusFilterOptions],
  },
];

export const inscriptionFinanceColumns: DataTableColumn<InscriptionFinanceRow>[] =
  [
    {
      // The name of the price row and not its amount: the amount is already in
      // `Total`, and what could not be read anywhere was *which* of the event's
      // prices governs this inscription. It is the effective price, the same one
      // the row's figures are calculated with.
      id: "price",
      header: "Precio",
      cell: (inscription) =>
        inscription.effectivePrice === null ? (
          "Sin precio"
        ) : (
          <Badge variant="secondary">{inscription.effectivePrice.name}</Badge>
        ),
      // No `filterValue`: the price's name is not an option of the `Estado`
      // filter, and the facets gather the values of every column.
      sortValue: (inscription) => inscription.effectivePrice?.name ?? "",
    },
    {
      id: "deposit",
      header: "Seña",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (inscription) => formatInscriptionAmount(inscription.depositAmount),
    },
    {
      // Decorative and unconditional: `Total` is the context column — what the
      // debt is measured against — so the whole of it is muted. Never per row: no
      // figure is provisional, and a grey that varies goes back to meaning
      // something.
      id: "total",
      header: "Total",
      className: "text-right tabular-nums text-muted-foreground",
      headerClassName: "text-right",
      cell: (inscription) => formatInscriptionAmount(inscription.totalAmount),
    },
    {
      // The row's only actionable figure, highlighted by column.
      id: "owedBalance",
      header: "Saldo adeudado",
      className: "text-right font-medium tabular-nums",
      headerClassName: "text-right",
      cell: (inscription) =>
        formatInscriptionAmount(inscription.owedBalanceAmount),
    },
    {
      // Last, after the money: the status is derived from the row's figures, so
      // it reads as their conclusion and not as their heading.
      id: "financialStatus",
      header: "Estado",
      cell: (inscription) => (
        <InscriptionStatusCell inscription={inscription} />
      ),
      // The filter comes from the same badge the cell shows and not from
      // `financialStatus`: a row badged `Retirada` that showed up when filtering
      // by `Pagada` would contradict itself on screen.
      filterValue: (inscription) => resolveStatusBadge(inscription).value,
    },
  ];

/**
 * The badge of the `Estado` column. `Retirada` **replaces** the status, just as
 * an anomaly does: the roster-withdrawal axis and the money axis do not share a
 * cell.
 *
 * It carries the retained amount inside because that is half of the fact: the
 * row is still there *because* money was left on it, and a bare `Retirada`
 * would not say how much. It is the same number as the `Total` column —for a
 * withdrawn row the total **is** what is allocated— and repeating it here is
 * what makes the cell readable on its own.
 */
function resolveStatusBadge(inscription: InscriptionFinanceRow) {
  return formatInscriptionStatusBadge(
    resolveInscriptionStatusBadge({
      anomalies: inscription.anomalies,
      financialStatus: inscription.financialStatus,
      withdrawn: inscription.withdrawn,
    }),
  );
}

function InscriptionStatusCell({
  inscription,
}: {
  inscription: InscriptionFinanceRow;
}) {
  const badge = resolveStatusBadge(inscription);

  return (
    <Badge variant={badge.variant}>
      {badge.kind === "withdrawn"
        ? `${badge.label} · ${formatAmount(inscription.allocatedAmount)}`
        : badge.label}
    </Badge>
  );
}

/** `null` is the absence of a price and not a zero, so it is named and not `$ 0`. */
function formatInscriptionAmount(amount: number | null) {
  return amount === null ? "Sin precio" : formatAmount(amount);
}

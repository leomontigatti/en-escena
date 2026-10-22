import {
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import type { DataTableFacetedFilterOption } from "@/components/shared/data-table.shared";
import { FinancialStatusBadge } from "@/components/shared/financial-status-badge";
import { Badge } from "@/components/ui/badge";
import {
  formatInscriptionStatusBadge,
  getInscriptionStatusFilterBadgeVariant,
  inscriptionStatusFilterOptions,
  linkedIndividualStatusFilterOption,
  seminarInscriptionStatusFilterOptions,
  uninvoicedStatusFilterOption,
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
  /** A linked individual's seminar inscription in an academy's finances
   * (ADR-0019): `$0`, no price and the `Particular` badge. Only the portal's
   * seminar financial detail carries it. */
  linkedIndividual?: boolean;
  owedBalanceAmount: number | null;
  /** A seminar inscription holding a reserved place; choreography rows never
   * carry it. */
  reserved?: boolean;
  /** A row its unit's invoice does not name (`Sin facturar`). Only the
   * administration's financial details carry it. */
  uninvoiced?: boolean;
  totalAmount: number | null;
  withdrawn: boolean;
};

/**
 * How an applied `Estado` filter reads on every financial list: as the badge
 * its rows wear.
 */
export function renderInscriptionStatusFilterValue(
  option: DataTableFacetedFilterOption,
) {
  return (
    <Badge variant={getInscriptionStatusFilterBadgeVariant(option.value)}>
      {option.label}
    </Badge>
  );
}

/** The `Estado` facet, whose options are the badges the column renders. */
function statusFacet(
  options: readonly DataTableFacetedFilterOption[],
): DataTableFacetedFilter[] {
  return [
    {
      id: "estado",
      label: "Estado",
      options: [...options],
      renderValue: renderInscriptionStatusFilterValue,
    },
  ];
}

export const inscriptionFinanceFacetedFilters = statusFacet(
  inscriptionStatusFilterOptions,
);

/** The same facet over seminar inscriptions, which can also read `Reservada`. */
export const seminarInscriptionFinanceFacetedFilters = statusFacet(
  seminarInscriptionStatusFilterOptions,
);

/**
 * The administration's financial details also read `Sin facturar`, the
 * `Facturada` axis the academy is not shown.
 */
export const adminInscriptionFinanceFacetedFilters = statusFacet([
  ...inscriptionStatusFilterOptions,
  uninvoicedStatusFilterOption,
]);

export const adminSeminarInscriptionFinanceFacetedFilters = statusFacet([
  ...seminarInscriptionStatusFilterOptions,
  uninvoicedStatusFilterOption,
]);

/** The academy's seminar detail can also read `Particular`. */
export const portalSeminarInscriptionFinanceFacetedFilters = statusFacet([
  ...seminarInscriptionStatusFilterOptions,
  linkedIndividualStatusFilterOption,
]);

export const inscriptionFinanceColumns: DataTableColumn<InscriptionFinanceRow>[] =
  [
    {
      // The name of the price row and not its amount: the amount is already in
      // `Total`, and what could not be read anywhere was *which* of the event's
      // prices governs this inscription. It is the effective price, the same one
      // the row's figures are calculated with.
      id: "price",
      header: "Precio",
      cell: (inscription) => <InscriptionPriceCell inscription={inscription} />,
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
      filterValue: (inscription) =>
        formatInscriptionStatusBadge(resolveInscriptionStatus(inscription))
          .value,
    },
  ];

/**
 * The badge of the `Estado` column. `Retirada` **replaces** the status, just as
 * an anomaly does: the roster-withdrawal axis and the money axis do not share a
 * cell. The retained amount is not repeated in it: for a withdrawn row the
 * `Total` column **is** what is allocated, so the row already says how much.
 */
function resolveInscriptionStatus(inscription: InscriptionFinanceRow) {
  return resolveInscriptionStatusBadge({
    anomalies: inscription.anomalies,
    financialStatus: inscription.financialStatus,
    linkedIndividual: inscription.linkedIndividual,
    reserved: inscription.reserved,
    uninvoiced: inscription.uninvoiced,
    withdrawn: inscription.withdrawn,
  });
}

function InscriptionPriceCell({
  inscription,
}: {
  inscription: InscriptionFinanceRow;
}) {
  // A linked individual's price is the individual's, not the academy's to read.
  if (inscription.linkedIndividual) {
    return "—";
  }

  if (inscription.effectivePrice === null) {
    return "Sin precio";
  }

  return <Badge variant="secondary">{inscription.effectivePrice.name}</Badge>;
}

function InscriptionStatusCell({
  inscription,
}: {
  inscription: InscriptionFinanceRow;
}) {
  return (
    <FinancialStatusBadge status={resolveInscriptionStatus(inscription)} />
  );
}

/** `null` is the absence of a price and not a zero, so it is named and not `$ 0`. */
function formatInscriptionAmount(amount: number | null) {
  return amount === null ? "Sin precio" : formatAmount(amount);
}

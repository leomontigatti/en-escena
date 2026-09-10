// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// the status column shared by the academy finance tables.
import {
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import {
  choreographyStatusFilterOptions,
  formatInscriptionStatusBadge,
} from "@/lib/finances/choreography-financial-status";
import {
  resolveInscriptionStatusBadge,
  type InscriptionFinancialStatus,
} from "@/lib/finances/inscription-financial-status";

function formatUnitStatusBadge(financialStatus: InscriptionFinancialStatus) {
  return formatInscriptionStatusBadge(
    resolveInscriptionStatusBadge({ anomalies: [], financialStatus }),
  );
}

export const unitStatusFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "estado",
    label: "Estado",
    options: [...choreographyStatusFilterOptions],
  },
];

export function statusColumn<
  TRow extends { financialStatus: InscriptionFinancialStatus },
>(): DataTableColumn<TRow> {
  return {
    id: "financialStatus",
    header: "Estado",
    cell: (row) => {
      const badge = formatUnitStatusBadge(row.financialStatus);

      return <Badge variant={badge.variant}>{badge.label}</Badge>;
    },
    filterValue: (row) => formatUnitStatusBadge(row.financialStatus).value,
  };
}

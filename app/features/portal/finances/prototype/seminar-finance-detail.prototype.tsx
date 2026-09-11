// PROTOTYPE — throwaway, lives only on branch `prototype/891-seminar-money-portal`.
//
// Part of the portal seminar-money prototype for wayfinder ticket #891 (map #884):
// the academy's `(seminar, academy)` financial detail, twin of the portal
// choreography detail (`features/portal/finances/choreography-detail/view.tsx`)
// and read-only twin of the admin one decided on #890.
import { Info } from "lucide-react";

import { PortalListPage } from "@/components/portal/ui";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  isSeminarFull,
  summarizeSeminarInscriptions,
  type PortalMoneySeminar,
  type SeminarInscriptionFigures,
} from "@/features/portal/seminars/prototype/seminar-money-portal-fixtures.prototype";
import {
  inscriptionFinanceColumns,
  inscriptionFinanceFacetedFilters,
  type InscriptionFinanceRow,
} from "@/lib/finances/inscription-finance-columns";
import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";

type SeminarFinanceRow = InscriptionFinanceRow & {
  inscription: SeminarInscriptionFigures;
};

/**
 * Titled with the instructor alone, as the admin detail is. No `Emitir factura`
 * and no money dialog: the name is plain text. The `Precio` badge shows the
 * effective row's name, which is where the participant reading lives (#890
 * dropped a separate readout). Withdrawn rows stay, badged `Retirada`.
 */
export function PortalSeminarFinanceDetailPrototype({
  availableBalanceAmount,
  seminar,
}: {
  availableBalanceAmount: number;
  seminar: PortalMoneySeminar;
}) {
  const figures = summarizeSeminarInscriptions(seminar.inscriptions);
  const rows: SeminarFinanceRow[] = seminar.inscriptions.map((inscription) => ({
    allocatedAmount: inscription.allocatedAmount,
    anomalies: [],
    depositAmount: inscription.depositAmount,
    effectivePrice: inscription.price ? { name: inscription.price.name } : null,
    financialStatus: inscription.financialStatus,
    inscription,
    owedBalanceAmount: inscription.owedBalanceAmount,
    totalAmount: inscription.totalAmount,
    withdrawn: inscription.withdrawn,
  }));

  return (
    <PortalListPage
      titleId="finanzas-seminario-title"
      title={seminar.instructorName}
      description="Revisá los importes de este seminario y de cada persona inscripta."
    >
      {isSeminarFull(seminar) ? (
        <Alert>
          <Info aria-hidden="true" />
          <AlertDescription>
            No quedan lugares en el seminario: las inscripciones con seña
            pendiente no pueden cubrirla hasta que se libere uno.
          </AlertDescription>
        </Alert>
      ) : null}

      <OperationalFinanceMetrics
        availableBalanceAmount={availableBalanceAmount}
        depositAmount={figures.depositAmount}
        owedBalanceAmount={figures.owedBalanceAmount}
        owedDepositAmount={figures.owedDepositAmount}
        totalAmount={figures.totalAmount}
      />

      <section aria-label="Inscripciones">
        <ClientDataTable
          rows={rows}
          columns={columns}
          facetedFilters={inscriptionFinanceFacetedFilters}
          getRowKey={(row) => row.inscription.id}
          searchPlaceholder="Buscar inscripción por nombre"
          textFilterColumnId="inscripto"
          emptyMessage="No hay inscripciones para mostrar."
        />
      </section>
    </PortalListPage>
  );
}

const columns: DataTableColumn<SeminarFinanceRow>[] = [
  {
    id: "inscripto",
    header: "Inscripto",
    className: "font-medium",
    cell: (row) => row.inscription.person.fullName,
    filterValue: (row) => row.inscription.person.fullName,
    sortValue: (row) => row.inscription.person.fullName,
  },
  ...inscriptionFinanceColumns,
];

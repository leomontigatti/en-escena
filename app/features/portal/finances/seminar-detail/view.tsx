import { AlertTriangle, Info } from "lucide-react";

import { PortalListPage } from "@/components/portal/ui";
import { AlertStack } from "@/components/shared/alert-stack";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDate } from "@/features/admin/schedules/view-shared";
import type { loadPortalSeminarFinanceDetail } from "@/features/portal/finances/seminar-detail/server";
import { formatDancerName } from "@/lib/finances/formatters";
import {
  inscriptionFinanceColumns,
  inscriptionFinanceFacetedFilters,
} from "@/lib/finances/inscription-finance-columns";
import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";

type PortalSeminarFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadPortalSeminarFinanceDetail>
>;

type InscriptionRow =
  PortalSeminarFinanceDetailLoaderData["inscriptions"][number];

/**
 * The academy's `(seminar, academy)` financial detail. It is the
 * administrator's detail minus what only the administrator can do — there is no
 * money dialog and no comprobante here — and the portal choreography detail's
 * twin, differing only where the domain does: the unit is titled by the
 * **instructor alone** and the inscriptions table carries no `Tipo` column.
 *
 * **This is the one portal screen that lists withdrawn inscriptions.** The
 * money a withdrawal retained is accounted for here and nowhere else, so
 * leaving those rows out would make the figures above them unexplainable.
 */
export function PortalSeminarFinanceDetailRouteView({
  loaderData,
}: {
  loaderData: PortalSeminarFinanceDetailLoaderData;
}) {
  const seminar = loaderData.seminar;

  return (
    <PortalListPage
      titleId="finanzas-seminario-title"
      title={seminar.instructorName}
      description={`Revisá los importes del seminario del ${formatDate(
        seminar.scheduledDate,
      )} y de cada inscripción de tu academia.`}
    >
      <SeminarAlerts seminar={seminar} />

      <OperationalFinanceMetrics
        availableBalanceAmount={loaderData.availableBalanceAmount}
        depositAmount={seminar.depositAmount}
        owedBalanceAmount={seminar.owedBalanceAmount}
        owedDepositAmount={seminar.owedDepositAmount}
        totalAmount={seminar.totalAmount}
      />

      <InscriptionsTable inscriptions={loaderData.inscriptions} />
    </PortalListPage>
  );
}

/**
 * The full seminar is stated and **never blocks**, the same notice the panel
 * carries: the refusal it announces belongs to one write — the allocation that
 * would cover a deposit — and that write is the administrator's, so here it is
 * an explanation and not a warning.
 */
function SeminarAlerts({
  seminar,
}: {
  seminar: PortalSeminarFinanceDetailLoaderData["seminar"];
}) {
  const missingPrice = seminar.depositAmount.status === "incomplete";
  const overAllocated = seminar.anomalies.includes("overAllocated");
  const isFull = seminar.availablePlaces === 0;

  if (!missingPrice && !overAllocated && !isFull) {
    return null;
  }

  return (
    <AlertStack>
      {overAllocated ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            Hay inscripciones con más dinero asignado que su total. Escribile a
            administración para que lo corrija.
          </AlertDescription>
        </Alert>
      ) : null}
      {isFull ? (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertDescription>
            El seminario no tiene lugares disponibles: las inscripciones con la
            seña cubierta ya ocupan el cupo. Podés inscribir igual, pero la seña
            de una nueva inscripción no se cubre hasta que se libere un lugar.
          </AlertDescription>
        </Alert>
      ) : null}
      {missingPrice ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            Este seminario todavía no tiene un precio que alcance a tus
            inscripciones: hasta que administración lo cargue no se puede
            calcular lo que adeudan.
          </AlertDescription>
        </Alert>
      ) : null}
    </AlertStack>
  );
}

function InscriptionsTable({
  inscriptions,
}: {
  inscriptions: InscriptionRow[];
}) {
  return (
    <section aria-label="Inscripciones">
      <ClientDataTable
        rows={inscriptions}
        columns={inscriptionColumns}
        facetedFilters={inscriptionFinanceFacetedFilters}
        getRowKey={(inscription) => inscription.inscriptionId}
        searchPlaceholder="Buscar inscripción por nombre"
        textFilterColumnId="person"
        emptyMessage="No hay inscripciones para mostrar."
      />
    </section>
  );
}

const inscriptionColumns: DataTableColumn<InscriptionRow>[] = [
  {
    // Plain text and not a button: the administrator's name cell opens the
    // money dialog, which is a write the academy does not have. It is the one
    // column this screen builds for itself; the five money ones are shared.
    id: "person",
    header: "Inscripto",
    className: "font-medium",
    cell: (inscription) => formatDancerName(inscription),
    filterValue: (inscription) => formatDancerName(inscription),
    sortValue: (inscription) => formatDancerName(inscription),
  },
  ...inscriptionFinanceColumns,
];

import { AlertTriangle } from "lucide-react";

import { PortalListPage } from "@/components/portal/ui";
import { AlertStack } from "@/components/shared/alert-stack";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDancerName } from "@/lib/finances/formatters";
import {
  inscriptionFinanceColumns,
  inscriptionFinanceFacetedFilters,
} from "@/lib/finances/inscription-finance-columns";
import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";
import type { loadPortalChoreographyFinanceDetail } from "@/features/portal/finances/choreography-detail/server";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";

type PortalChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadPortalChoreographyFinanceDetail>
>;

type InscriptionRow =
  PortalChoreographyFinanceDetailLoaderData["inscriptions"][number];

/**
 * The academy's financial detail is the administrator's, minus what only the
 * administrator can do: there is no `Emitir factura` here, and the dancer's name
 * is plain text because the money dialog behind it is a write.
 *
 * Everything that is a *reading* —the title, the five metrics and every column
 * of the inscriptions table after the dancer— is literally the same code as the
 * administrator's. That is the point: when the academy calls asking about a
 * figure, both parties are looking at the same one.
 */
export function PortalChoreographyFinanceDetailRouteView({
  loaderData,
}: {
  loaderData: PortalChoreographyFinanceDetailLoaderData;
}) {
  const choreography = loaderData.choreography;

  return (
    <PortalListPage
      titleId="finanzas-coreografia-title"
      title={`${choreography.name} # ${formatEventSequenceNumber(
        choreography.choreographyNumber,
      )}`}
      description="Revisá los importes de esta coreografía y de cada bailarín inscripto."
    >
      <ChoreographyAlerts choreography={choreography} />

      <OperationalFinanceMetrics
        availableBalanceAmount={loaderData.availableBalanceAmount}
        depositAmount={choreography.depositAmount}
        owedBalanceAmount={choreography.owedBalanceAmount}
        owedDepositAmount={choreography.owedDepositAmount}
        totalAmount={choreography.totalAmount}
      />

      <InscriptionsTable inscriptions={loaderData.inscriptions} />
    </PortalListPage>
  );
}

function ChoreographyAlerts({
  choreography,
}: {
  choreography: PortalChoreographyFinanceDetailLoaderData["choreography"];
}) {
  const missingPrice = choreography.depositAmount.status === "incomplete";
  const overAllocated = choreography.anomalies.includes("overAllocated");

  if (!missingPrice && !overAllocated) {
    return null;
  }

  return (
    <AlertStack>
      {overAllocated ? <OverAllocatedAlert /> : null}
      {missingPrice ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            Esta coreografía todavía no tiene un precio configurado: hasta que
            administración lo cargue no se puede calcular lo que adeuda.
          </AlertDescription>
        </Alert>
      ) : null}
    </AlertStack>
  );
}

/**
 * The `Sobreasignada` anomaly, as an alert and not as a badge, exactly as on the
 * administrator's detail: money in excess is something somebody has to resolve.
 *
 * What changes is who. The academy cannot move an allocation, so the alert names
 * the money and points at administración instead of sending the reader to a list
 * they cannot act on. It is self-resolving —it is derived from today's money— so
 * there is nothing to dismiss.
 */
function OverAllocatedAlert() {
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription>
        Hay inscripciones con más dinero asignado que su total. Escribile a
        administración para que lo corrija.
      </AlertDescription>
    </Alert>
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
        getRowKey={(inscription) => inscription.dancerId}
        searchPlaceholder="Buscar inscripción por bailarín"
        textFilterColumnId="dancer"
        emptyMessage="No hay inscripciones para mostrar."
      />
    </section>
  );
}

const inscriptionColumns: DataTableColumn<InscriptionRow>[] = [
  {
    // Plain text and not a button: the administrator's name cell opens the money
    // dialog, which is a write the academy does not have. It is the one column
    // this screen builds for itself; the five money ones are shared.
    id: "dancer",
    header: "Bailarín",
    className: "font-medium",
    cell: (inscription) => formatDancerName(inscription),
    filterValue: (inscription) => formatDancerName(inscription),
    sortValue: (inscription) => formatDancerName(inscription),
  },
  ...inscriptionFinanceColumns,
];

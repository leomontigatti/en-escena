import { AlertTriangle, Info } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InscriptionMoneyDialog } from "@/features/admin/finances/inscription-money/dialog";
import { formatDate } from "@/features/admin/schedules/view-shared";
import { formatDancerName } from "@/lib/finances/formatters";
import {
  inscriptionFinanceColumns,
  inscriptionFinanceFacetedFilters,
} from "@/lib/finances/inscription-finance-columns";
import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";

import type { loadSeminarFinanceDetail } from "./server";

type SeminarFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadSeminarFinanceDetail>
>;

type InscriptionRow = SeminarFinanceDetailLoaderData["inscriptions"][number];

type SeminarFinanceDetailViewProps = {
  loaderData: SeminarFinanceDetailLoaderData;
};

/**
 * The `(seminar, academy)` financial detail. It is the choreography detail's
 * twin and differs only where the domain does: the unit is titled by the
 * **instructor alone** — the seminar's name everywhere on both sides — and the
 * inscriptions table carries **no `Tipo` column**, because a seminar
 * inscription has no group type to read.
 *
 * There is no `Emitir factura` here yet: the seminar's fiscal anchor is a later
 * slice of the PRD, and an affordance that cannot bill would be a promise.
 */
export function SeminarFinanceDetailView({
  loaderData,
}: SeminarFinanceDetailViewProps) {
  const seminar = loaderData.seminar;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={seminar ? seminar.instructorName : "Seminario no encontrado"}
      description={
        seminar
          ? `Revisá y/o modificá las asignaciones de cada inscripción del seminario del ${formatDate(seminar.scheduledDate)}.`
          : "No encontramos ese seminario dentro de la lista financiera de la academia."
      }
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar el seminario",
        description:
          "Activá un evento para consultar el detalle financiero de un seminario.",
      }}
    >
      {seminar ? (
        <div className="flex flex-col gap-6">
          <SeminarAlerts loaderData={loaderData} />

          {/* The academy's five, narrowed to this seminar. `Saldo disponible`
              stays the academy's: unallocated money is no seminar's, and it is
              the pool the allocations made below come out of. */}
          <OperationalFinanceMetrics
            availableBalanceAmount={loaderData.availableBalanceAmount}
            depositAmount={seminar.depositAmount}
            owedBalanceAmount={seminar.owedBalanceAmount}
            owedDepositAmount={seminar.owedDepositAmount}
            totalAmount={seminar.totalAmount}
          />

          <InscriptionsTable
            inscriptions={loaderData.inscriptions}
            priceOptionsByInscription={loaderData.priceOptionsByInscription}
          />
        </div>
      ) : (
        <AdminEmptyState
          title="Seminario no encontrado"
          description="Volvé a la lista financiera y elegí un seminario."
        />
      )}
    </AdminResourceLayout>
  );
}

/**
 * The full seminar is stated and **never blocks**: the refusal it announces
 * belongs to one write — the allocation that would cover a deposit — so partial
 * allocations and everything else on this screen go through unchanged
 * (docs/domain/seminars.md, "The place").
 */
function SeminarAlerts({ loaderData }: SeminarFinanceDetailViewProps) {
  const missingPrice =
    loaderData.seminar?.depositAmount.status === "incomplete";
  const overAllocated =
    loaderData.seminar?.anomalies.includes("overAllocated") ?? false;
  const isFull = loaderData.seminar?.availablePlaces === 0;

  if (!missingPrice && !overAllocated && !isFull) {
    return null;
  }

  return (
    <AlertStack>
      {overAllocated ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            Hay inscripciones con más dinero asignado que su total. Podés
            corregirlo desde la lista de inscripciones.
          </AlertDescription>
        </Alert>
      ) : null}
      {isFull ? (
        <Alert>
          <Info aria-hidden="true" />
          <AlertDescription>
            El seminario no tiene lugares disponibles: las inscripciones con la
            seña cubierta ya ocupan el cupo. Podés asignar dinero igual, pero
            una asignación que cubra la seña de otra inscripción se rechaza
            hasta que se libere un lugar.
          </AlertDescription>
        </Alert>
      ) : null}
      {missingPrice ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            Hay inscripciones sin un precio de seminario que las alcance: no se
            puede calcular lo que adeudan ni cobrarlas.
          </AlertDescription>
        </Alert>
      ) : null}
    </AlertStack>
  );
}

/**
 * The money dialog lives **next to** the table and not inside the row that
 * opened it, for the same reason it does on the choreography detail: a cell is
 * remounted by every revalidation, which would take a refused write's message
 * with it (#708).
 */
function InscriptionsTable({
  inscriptions,
  priceOptionsByInscription,
}: {
  inscriptions: InscriptionRow[];
  priceOptionsByInscription: SeminarFinanceDetailLoaderData["priceOptionsByInscription"];
}) {
  const [openInscriptionId, setOpenInscriptionId] = useState<string | null>(
    null,
  );
  const openMoneyDialog = useCallback((inscriptionId: string) => {
    setOpenInscriptionId(inscriptionId);
  }, []);
  const closeMoneyDialog = useCallback((open: boolean) => {
    if (!open) {
      setOpenInscriptionId(null);
    }
  }, []);
  const columns = useMemo(
    () => buildInscriptionColumns(openMoneyDialog),
    [openMoneyDialog],
  );
  const openInscription =
    inscriptions.find(
      (inscription) => inscription.inscriptionId === openInscriptionId,
    ) ?? null;

  return (
    <section aria-label="Inscripciones">
      <ClientDataTable
        rows={inscriptions}
        columns={columns}
        facetedFilters={inscriptionFinanceFacetedFilters}
        getRowKey={(inscription) => inscription.inscriptionId}
        searchPlaceholder="Buscar inscripción por nombre"
        textFilterColumnId="person"
        emptyMessage="No hay inscripciones para mostrar."
      />
      {openInscription ? (
        <InscriptionMoneyDialog
          key={openInscription.inscriptionId}
          inscription={openInscription}
          onOpenChange={closeMoneyDialog}
          priceOptions={
            priceOptionsByInscription[openInscription.inscriptionId] ?? []
          }
          targetKind="seminar"
        />
      ) : null}
    </section>
  );
}

function buildInscriptionColumns(
  onOpenMoneyDialog: (inscriptionId: string) => void,
): DataTableColumn<InscriptionRow>[] {
  return [
    {
      id: "person",
      header: "Inscripto",
      className: "font-medium",
      cell: (inscription) => (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-left font-medium"
          onClick={() => onOpenMoneyDialog(inscription.inscriptionId)}
        >
          {formatDancerName(inscription)}
        </Button>
      ),
      filterValue: (inscription) => formatDancerName(inscription),
      sortValue: (inscription) => formatDancerName(inscription),
    },
    ...inscriptionFinanceColumns,
  ];
}

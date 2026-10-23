import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FinancialDetailTabs } from "@/features/admin/finances/anchor-comprobantes/tabs";
import { EmissionBlockedDialog } from "@/features/admin/finances/comprobante-emission/blocked-dialog";
import { EmissionDialog } from "@/features/admin/finances/comprobante-emission/dialog";
import {
  billingFacet,
  PaymentAndBillingBadges,
} from "@/components/shared/billing-status-badge";
import { deriveUnitBillingStatus } from "@/lib/comprobantes/anchor-billing";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import { PendingDocumentAlert } from "@/features/admin/finances/comprobante-emission/pending-document-alert";
import {
  formatEmitActionLabel,
  type AnchorInvoicing,
} from "@/features/admin/finances/comprobante-emission/shared";
import { IndividualPersonBadge } from "@/features/admin/finances/individual-person-badge";
import { InscriptionMoneyDialog } from "@/features/admin/finances/inscription-money/dialog";
import { formatDate } from "@/features/admin/schedules/view-shared";
import { formatDancerName } from "@/lib/finances/formatters";
import {
  inscriptionFinanceColumns,
  seminarInscriptionFinanceFacetedFilters,
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
 * `Emitir factura` lives in the header menu exactly as it does there, and it is
 * the only entry point to seminar invoicing: it bills every inscription this
 * academy holds in this seminar. The bulk emission of the academy's finance
 * list covers choreographies only.
 */
export function SeminarFinanceDetailView({
  loaderData,
}: SeminarFinanceDetailViewProps) {
  const seminar = loaderData.seminar;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={seminar ? seminar.instructorName : "Seminario no encontrado"}
      // The badges the academy's list draws for this unit: its payment status,
      // anomaly included, and its comprobante status.
      titleBadge={
        seminar ? (
          <PaymentAndBillingBadges
            billingStatus={deriveUnitBillingStatus(loaderData.billing)}
            status={resolveInscriptionStatusBadge(seminar)}
          />
        ) : undefined
      }
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
      headerAction={
        seminar ? <SeminarActions loaderData={loaderData} /> : undefined
      }
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

          <FinancialDetailTabs
            comprobantes={loaderData.comprobantes}
            inscriptions={
              <InscriptionsTable
                inscriptions={loaderData.inscriptions}
                priceOptionsByInscription={loaderData.priceOptionsByInscription}
              />
            }
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
 * The header's single actions menu (`...`, ADR-0011), the choreography detail's
 * twin: the emission as a menu item named after the document the unit owes,
 * opening its own dialog, mounted as a sibling of the menu so the dropdown
 * closing does not take it away. With nothing owed the item stays and opens
 * `EmissionBlockedDialog`, which says why.
 */
function SeminarActions({ loaderData }: SeminarFinanceDetailViewProps) {
  const invoicing = loaderData.invoicing;
  // Frozen on open and unmounted when the dialog CLOSES, not when the unit
  // stops owing it: an emission recovered via "Verificar ahora" persists the
  // comprobante and revalidates the detail, and unmounting there would take
  // the `recovered` state with it (#577).
  const [emission, setEmission] = useState<Extract<
    AnchorInvoicing,
    { status: "ready" }
  > | null>(null);
  const [isEmissionBlockedOpen, setIsEmissionBlockedOpen] = useState(false);

  if (!invoicing) {
    return null;
  }

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
        <DropdownMenuItem
          onSelect={() =>
            invoicing.status === "ready"
              ? setEmission(invoicing)
              : setIsEmissionBlockedOpen(true)
          }
        >
          {formatEmitActionLabel(invoicing)}
        </DropdownMenuItem>
      </ResourceActionsMenu>
      {invoicing.status === "blocked" ? (
        <EmissionBlockedDialog
          invoicing={invoicing}
          onOpenChange={setIsEmissionBlockedOpen}
          open={isEmissionBlockedOpen}
        />
      ) : null}
      {emission ? (
        <EmissionDialog
          invoicing={emission}
          open
          onOpenChange={(next) => setEmission(next ? emission : null)}
        />
      ) : null}
    </>
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

  // `AlertStack` draws nothing when every alert below is absent.
  return (
    <AlertStack>
      {loaderData.billing?.anomaly ? (
        <PendingDocumentAlert
          billing={loaderData.billing}
          inscriptions={loaderData.inscriptions}
        />
      ) : null}
      {overAllocated ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Dinero asignado de más</AlertTitle>
          <AlertDescription>
            Hay inscripciones con más dinero asignado que su total. Podés
            corregirlo desde la lista de inscripciones.
          </AlertDescription>
        </Alert>
      ) : null}
      {isFull ? (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertTitle>Seminario sin lugares</AlertTitle>
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
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Inscripciones sin precio</AlertTitle>
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
        facetedFilters={inscriptionFacetedFilters}
        getRowKey={(inscription) => inscription.inscriptionId}
        searchPlaceholder="Buscar por nombre"
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
        <span className="flex items-center gap-2">
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-left font-medium"
            onClick={() => onOpenMoneyDialog(inscription.inscriptionId)}
          >
            {formatDancerName(inscription)}
          </Button>
          <IndividualPersonBadge personKind={inscription.personKind} />
        </span>
      ),
      filterValue: (inscription) => formatDancerName(inscription),
      sortValue: (inscription) => formatDancerName(inscription),
    },
    ...inscriptionFinanceColumns,
  ];
}

// The administration's detail also filters by the comprobante status, which
// the academy is never shown (ADR-0014 §10).
const inscriptionFacetedFilters = [
  ...seminarInscriptionFinanceFacetedFilters,
  billingFacet,
];

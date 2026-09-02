import { AlertTriangle } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";

import {
  inscriptionFinanceColumns,
  inscriptionFinanceFacetedFilters,
} from "../../inscription-finance-columns";
import { OperationalFinanceMetrics } from "../../operational-finance-metrics";
import { EmissionDialog } from "./comprobante-emission";
import { InscriptionMoneyDialog } from "./inscription-money-dialog";
import { formatDancerName } from "./shared";
import type { loadChoreographyFinanceDetail } from "./server";

type ChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadChoreographyFinanceDetail>
>;

type InscriptionRow =
  ChoreographyFinanceDetailLoaderData["inscriptions"][number];

type PriceOption = ChoreographyFinanceDetailLoaderData["priceOptions"][number];

type ChoreographyFinanceDetailViewProps = {
  loaderData: ChoreographyFinanceDetailLoaderData;
};

export function ChoreographyFinanceDetailView({
  loaderData,
}: ChoreographyFinanceDetailViewProps) {
  const choreography = loaderData.choreography;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      // The name identifies the choreography within the academy, and the number
      // identifies it within the event: the same number the choreography detail
      // titles itself with, so an administrator moving between the two pages
      // reads one identity and not two.
      title={
        choreography
          ? `${choreography.name} # ${formatEventSequenceNumber(
              choreography.choreographyNumber,
            )}`
          : "Coreografía no encontrada"
      }
      description={
        choreography
          ? "Revisá y/o modificá las asignaciones de cada inscripción desde la lista."
          : "No encontramos esa coreografía dentro de la lista financiera de la academia."
      }
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar la coreografía",
        description:
          "Activá un evento para consultar el detalle financiero de una coreografía.",
      }}
      headerAction={
        choreography ? (
          <ChoreographyActions loaderData={loaderData} />
        ) : undefined
      }
    >
      {choreography ? (
        <div className="flex flex-col gap-6">
          <ChoreographyAlerts loaderData={loaderData} />

          {/* The academy's five, narrowed to this choreography. `Saldo
              disponible` is the exception and stays the academy's —unallocated
              money is no choreography's— and it is the pool the allocations made
              below come out of. */}
          <OperationalFinanceMetrics
            availableBalanceAmount={loaderData.availableBalanceAmount}
            depositAmount={choreography.depositAmount}
            owedBalanceAmount={choreography.owedBalanceAmount}
            owedDepositAmount={choreography.owedDepositAmount}
            totalAmount={choreography.totalAmount}
          />

          <InscriptionsTable
            inscriptions={loaderData.inscriptions}
            priceOptions={loaderData.priceOptions}
          />
        </div>
      ) : (
        <AdminEmptyState
          title="Coreografía no encontrada"
          description="Volvé a la lista financiera y elegí una coreografía."
        />
      )}
    </AdminResourceLayout>
  );
}

function ChoreographyAlerts({
  loaderData,
}: ChoreographyFinanceDetailViewProps) {
  const missingPrice =
    loaderData.choreography?.depositAmount.status === "incomplete";
  const overAllocated =
    loaderData.choreography?.anomalies.includes("overAllocated") ?? false;

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
            Esta coreografía no tiene un precio configurado: no se puede
            calcular lo que adeuda ni cobrarla.
          </AlertDescription>
        </Alert>
      ) : null}
    </AlertStack>
  );
}

/**
 * The `Sobreasignada` anomaly on the detail, as an alert and not as a badge: in
 * the list it is how that choreography reads, here it is something somebody has
 * to resolve.
 *
 * **Generic and untitled, and it does not list dancers.** An alert that lists
 * them becomes a worse copy of the table right below it and grows without limit
 * with the roster. The table is where the rows are. It is self-resolving — it is
 * derived from today's money — so there is nothing to dismiss: it goes when the
 * problem goes.
 *
 * `destructive` and not amber, like the badge: `Seña pendiente` is already a
 * warning, and a pending deposit is the normal state of an unpaid inscription;
 * money in excess is money in the wrong place.
 */
function OverAllocatedAlert() {
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription>
        Hay inscripciones con más dinero asignado que su total. Podés corregirlo
        desde la lista de inscripciones.
      </AlertDescription>
    </Alert>
  );
}

/**
 * The header's single actions menu (`...`, ADR-0011): `Emitir factura` inside a
 * `ResourceActionsMenu` rather than a loose button. The item opens its own
 * dialog, mounted as a sibling of the menu so it is not unmounted when the
 * dropdown closes. The `Pagar seña` / `Pagar saldo` presets do not live here:
 * they are list actions over the selected choreographies.
 *
 * The menu is always there, and with nothing left to bill what gets disabled is
 * the option: a button that comes and goes does not teach what can be done in the
 * view, and "it is there but it cannot be used" says more than "it is not there".
 */
function ChoreographyActions({
  loaderData,
}: ChoreographyFinanceDetailViewProps) {
  const invoicing = loaderData.invoicing;
  const canEmit = invoicing?.canEmit ?? false;
  // The billable is frozen on open and the dialog unmounts when it is CLOSED, not
  // when it loses the affordance: an emission recovered via "Verificar ahora"
  // persists the comprobante and revalidates the detail, which stops being
  // billable. Unmounting there would take the `recovered` state with it (#577).
  const [emission, setEmission] = useState<typeof invoicing | null>(null);

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
        <DropdownMenuItem
          disabled={!canEmit || !invoicing}
          onSelect={(event) => {
            event.preventDefault();

            if (invoicing) {
              setEmission(invoicing);
            }
          }}
        >
          Emitir factura
        </DropdownMenuItem>
      </ResourceActionsMenu>
      {emission ? (
        <EmissionDialog
          billableAmount={emission.billableAmount}
          open
          onOpenChange={(next) => setEmission(next ? emission : null)}
        />
      ) : null}
    </>
  );
}

/**
 * The money dialog lives **next to** the table and not inside the row that
 * opened it. A cell is a place a dialog cannot survive in: any revalidation
 * hands the view a fresh `loaderData`, the columns are rebuilt from it, and
 * React Table remounts every cell — which used to take the open dialog with it
 * the instant a refused write came back, hiding the reason (#708). Out here the
 * row is looked up by its dancer on each render, so the dialog also reads the
 * figures the revalidation has just brought in.
 */
function InscriptionsTable({
  inscriptions,
  priceOptions,
}: {
  inscriptions: InscriptionRow[];
  priceOptions: PriceOption[];
}) {
  const [openDancerId, setOpenDancerId] = useState<string | null>(null);
  // Stable, so the columns are not rebuilt — and the rows not remounted — by a
  // re-render of the view.
  const openMoneyDialog = useCallback((dancerId: string) => {
    setOpenDancerId(dancerId);
  }, []);
  const closeMoneyDialog = useCallback((open: boolean) => {
    if (!open) {
      setOpenDancerId(null);
    }
  }, []);
  const columns = useMemo(
    () => buildInscriptionColumns(openMoneyDialog),
    [openMoneyDialog],
  );
  const openInscription =
    inscriptions.find(
      (inscription) =>
        inscription.dancerId === openDancerId &&
        inscription.inscriptionId !== null,
    ) ?? null;

  return (
    <section aria-label="Inscripciones">
      <ClientDataTable
        rows={inscriptions}
        columns={columns}
        facetedFilters={inscriptionFinanceFacetedFilters}
        getRowKey={(inscription) => inscription.dancerId}
        searchPlaceholder="Buscar inscripción por bailarín"
        textFilterColumnId="dancer"
        emptyMessage="No hay inscripciones para mostrar."
      />
      {openInscription ? (
        <InscriptionMoneyDialog
          key={openDancerId}
          inscription={openInscription}
          onOpenChange={closeMoneyDialog}
          priceOptions={priceOptions}
        />
      ) : null}
    </section>
  );
}

function buildInscriptionColumns(
  onOpenMoneyDialog: (dancerId: string) => void,
): DataTableColumn<InscriptionRow>[] {
  return [
    {
      id: "dancer",
      header: "Bailarín",
      className: "font-medium",
      cell: (inscription) => (
        <DancerNameCell
          inscription={inscription}
          onOpenMoneyDialog={onOpenMoneyDialog}
        />
      ),
      filterValue: (inscription) => formatDancerName(inscription),
      sortValue: (inscription) => formatDancerName(inscription),
    },
    ...inscriptionFinanceColumns,
  ];
}

/**
 * The dancer's name is **the** entry point for money on that inscription: one
 * button per row, and the dialog behind it decides its own shape from what the
 * row holds. There is no price control in this cell and no second affordance —
 * a row without an inscription yet is the only one that stays plain text,
 * because there is nothing to put money on.
 */
function DancerNameCell({
  inscription,
  onOpenMoneyDialog,
}: {
  inscription: InscriptionRow;
  onOpenMoneyDialog: (dancerId: string) => void;
}) {
  if (inscription.inscriptionId === null) {
    return <>{formatDancerName(inscription)}</>;
  }

  return (
    <Button
      type="button"
      variant="link"
      className="h-auto p-0 text-left font-medium"
      onClick={() => onOpenMoneyDialog(inscription.dancerId)}
    >
      {formatDancerName(inscription)}
    </Button>
  );
}

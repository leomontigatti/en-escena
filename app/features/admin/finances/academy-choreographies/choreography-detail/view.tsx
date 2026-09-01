import { AlertTriangle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { MetricCard } from "@/components/shared/metric-card";
import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { formatInscriptionStatusBadge } from "@/lib/finances/choreography-financial-status";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import { choreographyGroupTypeOptions } from "@/lib/portal/choreographies";

import { formatAmount, formatOperationalAmount } from "../../formatters";
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
      title={choreography ? "Detalle financiero" : "Coreografía no encontrada"}
      description={
        choreography
          ? "Revisá los importes, datos y participaciones vinculadas a esta coreografía."
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

          <section className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="Seña"
              value={formatOperationalAmount(choreography.depositAmount)}
            />
            <MetricCard
              title="Saldo adeudado"
              value={formatOperationalAmount(choreography.owedBalanceAmount)}
            />
            <MetricCard
              title="Total"
              value={formatOperationalAmount(choreography.totalAmount)}
            />
          </section>

          <Card aria-label="Información financiera">
            <CardContent>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <ReadOnlyField
                  id="finance-choreography-academy"
                  label="Academia"
                  value={loaderData.academy.name}
                />
                <ReadOnlyField
                  id="finance-choreography-name"
                  label="Nombre"
                  value={choreography.name}
                />
                <ReadOnlySelectField
                  label="Tipo de grupo"
                  options={choreographyGroupTypeOptions}
                  value={choreography.groupType}
                />
              </FieldGroup>
            </CardContent>
          </Card>

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
 * dropdown closes. The menu is not rendered at all when no action is available.
 * The `Pagar seña` / `Pagar saldo` presets do not live here: they are list
 * actions over the selected choreographies.
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

  if (!canEmit && !emission) {
    return null;
  }

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
        {canEmit && invoicing ? (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setEmission(invoicing);
            }}
          >
            Emitir factura
          </DropdownMenuItem>
        ) : null}
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
        getRowKey={(inscription) => inscription.dancerId}
        searchPlaceholder="Buscar inscripción por bailarín"
        emptyMessage="No hay inscripciones para mostrar."
        hideSearch
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
    ...inscriptionAmountColumns,
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

const inscriptionAmountColumns: DataTableColumn<InscriptionRow>[] = [
  {
    id: "financialStatus",
    header: "Estado",
    cell: (inscription) => <InscriptionStatusCell inscription={inscription} />,
  },
  {
    id: "basePrice",
    header: "Precio base",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (inscription) => formatInscriptionAmount(inscription.basePriceAmount),
  },
  {
    id: "deposit",
    header: "Seña",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (inscription) => formatInscriptionAmount(inscription.depositAmount),
  },
  {
    // Decorative and unconditional: `Total` is the context column — what the debt
    // is measured against — so the whole of it is muted. Never per row: no figure
    // is provisional, and a grey that varies goes back to meaning something.
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
function InscriptionStatusCell({
  inscription,
}: {
  inscription: InscriptionRow;
}) {
  const badge = formatInscriptionStatusBadge(
    resolveInscriptionStatusBadge({
      anomalies: inscription.anomalies,
      financialStatus: inscription.financialStatus,
      withdrawn: inscription.withdrawn,
    }),
  );

  return (
    <Badge variant={badge.variant}>
      {badge.kind === "withdrawn"
        ? `${badge.label} · ${formatAmount(inscription.allocatedAmount)}`
        : badge.label}
    </Badge>
  );
}

function formatInscriptionAmount(amount: number | null) {
  return amount === null ? "Sin precio" : formatAmount(amount);
}

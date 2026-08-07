import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useFetcher } from "react-router";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { MetricCard } from "@/components/shared/metric-card";
import {
  ReadOnlyDateField,
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import {
  formatInscriptionFinancialStatus,
  getInscriptionFinancialStatusBadgeVariant,
} from "@/lib/finances/choreography-financial-status";
import {
  type InscriptionAmountColumn,
  isTentativeInscriptionAmount,
} from "@/lib/finances/inscription-amounts";
import { choreographyGroupTypeOptions } from "@/lib/portal/choreographies";

import { formatAmount, formatOperationalAmount } from "../../formatters";
import { EmissionDialog } from "./comprobante-emission";
import { InscriptionBalanceDialog } from "./inscription-balance-dialog";
import {
  formatDancerName,
  InscriptionCobroDialog,
} from "./inscription-cobro-dialog";
import { InscriptionUndoDialog } from "./inscription-undo-dialog";
import type { loadChoreographyFinanceDetail, PortionCoverage } from "./server";
import { payBalanceIntent, payDepositIntent } from "./shared";

type ChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadChoreographyFinanceDetail>
>;

type InscriptionRow =
  ChoreographyFinanceDetailLoaderData["inscriptions"][number];
type StageTotal = NonNullable<
  ChoreographyFinanceDetailLoaderData["stageTotalAmount"]
>;
type CobroStage = NonNullable<ChoreographyFinanceDetailLoaderData["stage"]>;

/**
 * Whether the stage preset can be fired: it needs a complete owed figure (every
 * inscription priced) and a `Saldo disponible` that covers it. The server
 * checks again; this only avoids offering a charge that would bounce.
 */
function canFundStage(input: {
  availableBalanceAmount: number;
  stageTotalAmount: StageTotal | null;
}): boolean {
  return (
    input.stageTotalAmount !== null &&
    input.stageTotalAmount.status === "complete" &&
    input.stageTotalAmount.amount > 0 &&
    input.availableBalanceAmount >= input.stageTotalAmount.amount
  );
}

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
              slot={portionCoverageBadge(loaderData.invoicing.sena)}
              to={portionCoverageHref(loaderData.invoicing.sena)}
              linkLabel="Ver comprobante que cubre la seña"
            />
            <MetricCard
              title="Saldo adeudado"
              value={formatOperationalAmount(choreography.owedBalanceAmount)}
              slot={portionCoverageBadge(loaderData.invoicing.saldo)}
              to={portionCoverageHref(loaderData.invoicing.saldo)}
              linkLabel="Ver comprobante que cubre el saldo"
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
                <ReadOnlyDateField
                  emptyLabel="Sin pago completo"
                  label="Fecha de pago de la seña"
                  value={choreography.depositCompletedOn}
                />
              </FieldGroup>
            </CardContent>
          </Card>

          <InscriptionsTable
            canPayInscriptionBalance={loaderData.canPayInscriptionBalance}
            inscriptions={loaderData.inscriptions}
            inscriptionDeposit={loaderData.inscriptionDeposit}
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

/**
 * Badge de vigencia de la porción (Seña/Saldo): `Vigente` o `Desactualizada`
 * (ADR-0011). Devuelve `undefined` cuando ninguna factura vigente cubre la porción
 * —incluido el caso en que la única que la cubría fue anulada—, así la MetricCard
 * cae en su ícono por defecto y no queda un estado `Anulado` muerto. El link al
 * comprobante ya no es un botón aparte: lo lleva la card entera vía `to`.
 */
function portionCoverageBadge(coverage: PortionCoverage | null) {
  if (coverage === null) {
    return undefined;
  }

  return (
    <Badge variant={coverage.currency === "vigente" ? "success" : "warning"}>
      {coverage.currency === "vigente" ? "Vigente" : "Desactualizada"}
    </Badge>
  );
}

/**
 * Destino de la card de una porción: el comprobante vigente que la cubre. `null`
 * cuando no hay cobertura, y entonces la card no es un link.
 */
function portionCoverageHref(coverage: PortionCoverage | null) {
  return coverage === null
    ? undefined
    : `/administracion/comprobantes/${coverage.comprobanteId}`;
}

function ChoreographyAlerts({
  loaderData,
}: ChoreographyFinanceDetailViewProps) {
  const stage = loaderData.stage;
  const depositAmount = loaderData.choreography?.depositAmount;
  // With no applicable price the deposit cannot be quoted: the cause is the
  // missing price, not the available balance falling short. So we state that
  // cause and suppress the alert that blames the money.
  const missingDepositPrice =
    stage === "deposit" && depositAmount?.status === "incomplete";
  const notEnoughBalance =
    stage !== null &&
    !missingDepositPrice &&
    !canFundStage({
      availableBalanceAmount: loaderData.availableBalanceAmount,
      stageTotalAmount: loaderData.stageTotalAmount,
    });

  if (!notEnoughBalance && !missingDepositPrice) {
    return null;
  }

  return (
    <AlertStack>
      {missingDepositPrice ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            Esta coreografía no tiene un precio configurado para cobrar la seña.
          </AlertDescription>
        </Alert>
      ) : null}
      {notEnoughBalance ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            El saldo disponible de la academia no alcanza para{" "}
            {stage === "deposit"
              ? "cubrir la seña completa de la coreografía."
              : "cubrir el saldo completo de la coreografía."}
          </AlertDescription>
        </Alert>
      ) : null}
    </AlertStack>
  );
}

/**
 * Menú único de acciones del header (`...`, ADR-0011): reúne `Emitir factura` y el
 * cobro de la etapa vigente en un solo `ResourceActionsMenu`, en lugar de botones
 * sueltos. Cada item abre su propio diálogo, montado como hermano del menú para que
 * no se desmonte al cerrarse el dropdown. Si no hay ninguna acción disponible el
 * menú no se muestra.
 */
function ChoreographyActions({
  loaderData,
}: ChoreographyFinanceDetailViewProps) {
  const invoicing = loaderData.invoicing;
  const stage = loaderData.stage;
  const canEmit = invoicing?.canEmit ?? false;
  const canCobro =
    stage !== null &&
    canFundStage({
      availableBalanceAmount: loaderData.availableBalanceAmount,
      stageTotalAmount: loaderData.stageTotalAmount,
    });
  const [cobroOpen, setCobroOpen] = useState(false);
  // El facturable se congela al abrir y el diálogo se desmonta al CERRARLO, no
  // al perder la afordancia: una emisión recuperada por "Verificar ahora"
  // persiste el comprobante y revalida el detalle, que deja de ser facturable.
  // Desmontar ahí se llevaría puesto el estado `recovered` (#577).
  const [emission, setEmission] = useState<typeof invoicing | null>(null);

  if (!canEmit && !canCobro && !emission) {
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
        {canCobro ? (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setCobroOpen(true);
            }}
          >
            {stage === "deposit" ? "Pagar seña" : "Pagar saldo"}
          </DropdownMenuItem>
        ) : null}
      </ResourceActionsMenu>
      {emission ? (
        <EmissionDialog
          billableAmount={emission.billableAmount}
          porcion={emission.porcion}
          open
          onOpenChange={(next) => setEmission(next ? emission : null)}
        />
      ) : null}
      {canCobro && stage !== null && loaderData.stageTotalAmount !== null ? (
        <CobroDialog
          availableBalanceAmount={loaderData.availableBalanceAmount}
          open={cobroOpen}
          onOpenChange={setCobroOpen}
          stage={stage}
          stageTotalAmount={loaderData.stageTotalAmount}
        />
      ) : null}
    </>
  );
}

/**
 * The stage's cobro preset. It no longer picks a payment: it names the owed
 * amount and the system funds it from the academy's `Saldo disponible`, oldest
 * payment first. That is why the dialog only confirms.
 */
function CobroDialog({
  availableBalanceAmount,
  open,
  onOpenChange,
  stage,
  stageTotalAmount,
}: {
  availableBalanceAmount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: CobroStage;
  stageTotalAmount: StageTotal;
}) {
  const fetcher = useFetcher<{ status: "error"; message: string }>();
  const isSaving = fetcher.state !== "idle";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isSaving && onOpenChange(next)}
    >
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>
            {stage === "deposit" ? "Pagar seña" : "Pagar saldo"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Confirmá la asignación de la etapa completa de la coreografía desde
            el saldo disponible de la academia.
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input
            type="hidden"
            name="intent"
            value={stage === "deposit" ? payDepositIntent : payBalanceIntent}
          />

          <StageTotalSummary
            availableBalanceAmount={availableBalanceAmount}
            stage={stage}
            stageTotalAmount={stageTotalAmount}
          />

          {fetcher.data?.status === "error" ? (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertDescription>{fetcher.data.message}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSaving}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <Check aria-hidden="true" data-icon="inline-start" />
              )}
              Guardar
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What the preset will allocate and where it comes from: the stage's owed
 * figure against the academy's `Saldo disponible`. The administrator no longer
 * picks a payment, so what they need to see is that the money suffices.
 */
function StageTotalSummary({
  availableBalanceAmount,
  stage,
  stageTotalAmount,
}: {
  availableBalanceAmount: number;
  stage: CobroStage;
  stageTotalAmount: StageTotal;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/50 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {stage === "deposit" ? "Seña a cobrar" : "Saldo a cobrar"}
        </span>
        <span className="text-sm font-medium tabular-nums">
          {formatAmount(stageTotalAmount.amount)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">Saldo disponible</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatAmount(availableBalanceAmount)}
        </span>
      </div>
    </div>
  );
}

function InscriptionsTable({
  canPayInscriptionBalance,
  inscriptions,
  inscriptionDeposit,
}: {
  canPayInscriptionBalance: boolean;
  inscriptions: InscriptionRow[];
  inscriptionDeposit: ChoreographyFinanceDetailLoaderData["inscriptionDeposit"];
}) {
  // Las columnas se memoizan para conservar una referencia estable entre
  // renders: sin esto, cada render recrea el array y React Table remonta las
  // celdas, perdiendo el estado `open` del diálogo por fila (se abría y se
  // cerraba de inmediato al re-renderizar la página).
  const columns = useMemo(
    () =>
      buildInscriptionColumns({
        canPayInscriptionBalance,
        inscriptionDeposit,
      }),
    [canPayInscriptionBalance, inscriptionDeposit],
  );

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
    </section>
  );
}

function buildInscriptionColumns(cobro: {
  canPayInscriptionBalance: boolean;
  inscriptionDeposit: ChoreographyFinanceDetailLoaderData["inscriptionDeposit"];
}): DataTableColumn<InscriptionRow>[] {
  return [
    {
      id: "dancer",
      header: "Bailarín",
      className: "font-medium",
      cell: (inscription) => (
        <DancerNameCell
          canPayInscriptionBalance={cobro.canPayInscriptionBalance}
          inscription={inscription}
          inscriptionDeposit={cobro.inscriptionDeposit}
        />
      ),
      filterValue: (inscription) => formatDancerName(inscription),
      sortValue: (inscription) => formatDancerName(inscription),
    },
    ...inscriptionAmountColumns,
  ];
}

/**
 * Nombre del bailarín. Lo muestra como botón que abre el diálogo por fila cuando
 * hay algo para hacer con esa inscripción: cobrar seña de una `impaga` huérfana o
 * saldo de una `señada` huérfana (coreografía mixta), o deshacer una asignación
 * ya existente. Una `señada` mixta ofrece cobro y deshacer a la vez; una fila sin
 * cobro ni asignación (por ejemplo una `impaga` sin inscripción) es solo texto.
 */
function DancerNameCell({
  canPayInscriptionBalance,
  inscription,
  inscriptionDeposit,
}: {
  canPayInscriptionBalance: boolean;
  inscription: InscriptionRow;
  inscriptionDeposit: ChoreographyFinanceDetailLoaderData["inscriptionDeposit"];
}) {
  const [open, setOpen] = useState(false);
  const hasInscriptionId = inscription.inscriptionId !== null;
  const undoableAllocation = inscription.undoableAllocation;
  const canChargeDeposit =
    inscriptionDeposit !== null &&
    inscriptionDeposit.priceRows.length > 0 &&
    inscription.ladderStage === "impaga" &&
    hasInscriptionId;
  const canChargeBalance =
    canPayInscriptionBalance &&
    inscription.ladderStage === "señada" &&
    inscription.owedBalanceAmount !== null &&
    hasInscriptionId;

  if (!canChargeDeposit && !canChargeBalance && undoableAllocation === null) {
    return <>{formatDancerName(inscription)}</>;
  }

  function renderRowDialog() {
    if (canChargeDeposit && inscriptionDeposit !== null) {
      return (
        <InscriptionCobroDialog
          inscription={inscription}
          open={open}
          onOpenChange={setOpen}
          priceRows={inscriptionDeposit.priceRows}
        />
      );
    }
    if (canChargeBalance) {
      return (
        <InscriptionBalanceDialog
          inscription={inscription}
          open={open}
          onOpenChange={setOpen}
        />
      );
    }
    if (undoableAllocation !== null) {
      return (
        <InscriptionUndoDialog
          allocation={undoableAllocation}
          open={open}
          onOpenChange={setOpen}
        />
      );
    }
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-left font-medium"
        onClick={() => setOpen(true)}
      >
        {formatDancerName(inscription)}
      </Button>
      {renderRowDialog()}
    </>
  );
}

const inscriptionAmountColumns: DataTableColumn<InscriptionRow>[] = [
  {
    id: "financialStatus",
    header: "Estado",
    cell: (inscription) => (
      <Badge
        variant={getInscriptionFinancialStatusBadgeVariant(
          inscription.financialStatus,
        )}
      >
        {formatInscriptionFinancialStatus(inscription.financialStatus)}
      </Badge>
    ),
  },
  {
    id: "basePrice",
    header: "Precio base",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cellClassName: (inscription) =>
      tentativeAmountClassName(inscription.financialStatus, "basePrice"),
    cell: (inscription) => formatInscriptionAmount(inscription.basePriceAmount),
  },
  {
    id: "deposit",
    header: "Seña",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cellClassName: (inscription) =>
      tentativeAmountClassName(inscription.financialStatus, "deposit"),
    cell: (inscription) => formatInscriptionAmount(inscription.depositAmount),
  },
  {
    id: "total",
    header: "Total",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cellClassName: (inscription) =>
      tentativeAmountClassName(inscription.financialStatus, "total"),
    cell: (inscription) => formatInscriptionAmount(inscription.totalAmount),
  },
  {
    id: "owedBalance",
    header: "Saldo adeudado",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (inscription) =>
      formatInscriptionAmount(inscription.owedBalanceAmount),
  },
];

function tentativeAmountClassName(
  status: InscriptionRow["financialStatus"],
  column: InscriptionAmountColumn,
) {
  return isTentativeInscriptionAmount(status, column)
    ? "text-muted-foreground"
    : undefined;
}

function formatInscriptionAmount(amount: number | null) {
  return amount === null ? "Sin precio" : formatAmount(amount);
}

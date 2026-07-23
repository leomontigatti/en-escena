import {
  AlertTriangle,
  Check,
  CircleDollarSign,
  ExternalLink,
  Landmark,
  LoaderCircle,
  Receipt,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useFetcher } from "react-router";

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
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatChoreographyFinancialState,
  getChoreographyFinancialStateBadgeVariant,
} from "@/lib/finances/choreography-financial-state";
import {
  type InscriptionAmountColumn,
  isTentativeInscriptionAmount,
} from "@/lib/finances/inscription-amounts";
import { choreographyGroupTypeOptions } from "@/lib/portal/choreographies";

import {
  formatAmount,
  formatDate,
  formatOperationalAmount,
  formatTotalAmount,
} from "../formatters";
import { EmissionDialog } from "./comprobante-emission";
import { InscriptionBalanceDialog } from "./inscription-balance-dialog";
import {
  formatDancerName,
  InscriptionCobroDialog,
} from "./inscription-cobro-dialog";
import { InscriptionUndoDialog } from "./inscription-undo-dialog";
import { PaymentSelectItems } from "./payment-select-items";
import type {
  loadAdministrativeChoreographyFinanceDetail,
  PortionCoverage,
} from "./server";
import { payBalanceIntent, payDepositIntent } from "./shared";

type ChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadAdministrativeChoreographyFinanceDetail>
>;

type InscriptionRow =
  ChoreographyFinanceDetailLoaderData["inscriptions"][number];
type PaymentRow = ChoreographyFinanceDetailLoaderData["payments"][number];
type EligiblePayment = PaymentRow & { stageTotalAmount: number };
type CobroStage = NonNullable<ChoreographyFinanceDetailLoaderData["stage"]>;

type AdministracionCoreografiaFinancieraDetalleViewProps = {
  loaderData: ChoreographyFinanceDetailLoaderData;
};

export function AdministracionCoreografiaFinancieraDetalleView({
  loaderData,
}: AdministracionCoreografiaFinancieraDetalleViewProps) {
  const choreography = loaderData.choreography;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={choreography ? "Detalle financiero" : "Coreografía no encontrada"}
      description={
        choreography
          ? "Revisá los importes, datos y participaciones vinculadas a esta coreografía."
          : "No encontramos esa coreografía dentro de la cuenta corriente de la academia."
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
              icon={Receipt}
              title="Seña"
              value={formatOperationalAmount(choreography.depositAmount)}
              slot={portionCoverageSlot(loaderData.invoicing.sena)}
            />
            <MetricCard
              icon={Landmark}
              title="Saldo"
              value={formatOperationalAmount(choreography.balanceAmount)}
              slot={portionCoverageSlot(loaderData.invoicing.saldo)}
            />
            <MetricCard
              icon={CircleDollarSign}
              title="Total"
              value={formatTotalAmount(
                choreography.depositAmount,
                choreography.balanceAmount,
              )}
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
            payments={loaderData.payments}
          />
        </div>
      ) : (
        <AdminEmptyState
          title="Coreografía no encontrada"
          description="Volvé a la cuenta corriente y elegí una coreografía de la lista."
        />
      )}
    </AdminResourceLayout>
  );
}

/**
 * Slot de la MetricCard de una porción (Seña/Saldo): badge Vigente/Desactualizada
 * más un botón al comprobante que la cubre (ADR-0011). Devuelve `undefined` cuando
 * ninguna factura vigente cubre la porción —incluido el caso en que la única que
 * la cubría fue anulada—, así la MetricCard cae en su ícono por defecto y no queda
 * un estado `Anulado` muerto.
 */
function portionCoverageSlot(coverage: PortionCoverage | null) {
  if (coverage === null) {
    return undefined;
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant={coverage.currency === "vigente" ? "success" : "warning"}>
        {coverage.currency === "vigente" ? "Vigente" : "Desactualizada"}
      </Badge>
      <Button
        asChild
        variant="link"
        size="icon-sm"
        aria-label="Ver comprobante"
        title="Ver comprobante"
      >
        <Link to={`/administracion/comprobantes/${coverage.comprobanteId}`}>
          <ExternalLink aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}

function ChoreographyAlerts({
  loaderData,
}: AdministracionCoreografiaFinancieraDetalleViewProps) {
  const stage = loaderData.stage;
  const eligible = eligiblePayments(loaderData.payments);
  const needsAttention = loaderData.choreography?.needsAttention ?? false;
  const depositAmount = loaderData.choreography?.depositAmount;
  // Sin precio aplicable no se puede cotizar la seña: la causa es la falta de
  // precio configurado, no que los pagos no alcancen. Por eso enunciamos esa
  // causa y suprimimos la alerta que culpa a los pagos.
  const missingDepositPrice =
    stage === "deposit" && depositAmount?.status === "incomplete";
  const noEligiblePayments =
    stage !== null && eligible.length === 0 && !missingDepositPrice;

  if (!needsAttention && !noEligiblePayments && !missingDepositPrice) {
    return null;
  }

  return (
    <AlertStack>
      {needsAttention ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            Existen inscripciones que necesitan atención específica.
          </AlertDescription>
        </Alert>
      ) : null}
      {missingDepositPrice ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            Esta coreografía no tiene un precio configurado para cobrar la seña.
          </AlertDescription>
        </Alert>
      ) : null}
      {noEligiblePayments ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            No existe un pago registrado con saldo suficiente para{" "}
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
}: AdministracionCoreografiaFinancieraDetalleViewProps) {
  const invoicing = loaderData.invoicing;
  const stage = loaderData.stage;
  const eligible = eligiblePayments(loaderData.payments);
  const canEmit = invoicing?.canEmit ?? false;
  const canCobro = stage !== null && eligible.length > 0;
  const [emitOpen, setEmitOpen] = useState(false);
  const [cobroOpen, setCobroOpen] = useState(false);

  if (!canEmit && !canCobro) {
    return null;
  }

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
        {canEmit ? (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setEmitOpen(true);
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
      {invoicing?.canEmit ? (
        <EmissionDialog
          billableAmount={invoicing.billableAmount}
          porcion={invoicing.porcion}
          open={emitOpen}
          onOpenChange={setEmitOpen}
        />
      ) : null}
      {stage !== null && eligible.length > 0 ? (
        <CobroDialog
          eligiblePayments={eligible}
          open={cobroOpen}
          onOpenChange={setCobroOpen}
          stage={stage}
        />
      ) : null}
    </>
  );
}

function CobroDialog({
  eligiblePayments,
  open,
  onOpenChange,
  stage,
}: {
  eligiblePayments: EligiblePayment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: CobroStage;
}) {
  const fetcher = useFetcher<{ status: "error"; message: string }>();
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    null,
  );
  const isSaving = fetcher.state !== "idle";
  const selectedPayment =
    eligiblePayments.find((payment) => payment.id === selectedPaymentId) ??
    null;

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
            Elegí el pago que cubre la etapa completa de la coreografía.
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input
            type="hidden"
            name="intent"
            value={stage === "deposit" ? payDepositIntent : payBalanceIntent}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Pago a asignar</span>
            <Select
              name="paymentId"
              value={selectedPaymentId ?? ""}
              onValueChange={setSelectedPaymentId}
              disabled={isSaving}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elegí un pago" />
              </SelectTrigger>
              <SelectContent>
                <PaymentSelectItems payments={eligiblePayments} />
              </SelectContent>
            </Select>
          </div>

          {selectedPayment ? (
            <StageTotalSummary payment={selectedPayment} stage={stage} />
          ) : null}

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
            <Button type="submit" disabled={!selectedPaymentId || isSaving}>
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
 * Lo que se va a cobrar con el pago elegido. La seña se aclara contra la fecha
 * del pago, que es la que fija el precio: sin eso, el importe parece no
 * coincidir con el que muestra la coreografía cuando el precio ya cambió.
 */
function StageTotalSummary({
  payment,
  stage,
}: {
  payment: EligiblePayment;
  stage: CobroStage;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/50 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {stage === "deposit" ? "Seña a cobrar" : "Saldo a cobrar"}
        </span>
        <span className="text-sm font-medium tabular-nums">
          {formatAmount(payment.stageTotalAmount)}
        </span>
      </div>
      {stage === "deposit" ? (
        <span className="text-xs text-muted-foreground">
          Al precio vigente al {formatDate(payment.paymentDate)}.
        </span>
      ) : null}
    </div>
  );
}

function InscriptionsTable({
  canPayInscriptionBalance,
  inscriptions,
  inscriptionDeposit,
  payments,
}: {
  canPayInscriptionBalance: boolean;
  inscriptions: InscriptionRow[];
  inscriptionDeposit: ChoreographyFinanceDetailLoaderData["inscriptionDeposit"];
  payments: PaymentRow[];
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
        payments,
      }),
    [canPayInscriptionBalance, inscriptionDeposit, payments],
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

/**
 * Pagos que cubren la etapa completa. Cada uno trae el total que el cobro le va
 * a exigir según su propia fecha, así que la comparación es contra ese total y
 * no contra uno único calculado a hoy.
 */
function eligiblePayments(payments: PaymentRow[]): EligiblePayment[] {
  return payments.filter(
    (payment): payment is EligiblePayment =>
      payment.stageTotalAmount !== null &&
      payment.availableAmount >= payment.stageTotalAmount,
  );
}

function buildInscriptionColumns(cobro: {
  canPayInscriptionBalance: boolean;
  inscriptionDeposit: ChoreographyFinanceDetailLoaderData["inscriptionDeposit"];
  payments: PaymentRow[];
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
          payments={cobro.payments}
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
  payments,
}: {
  canPayInscriptionBalance: boolean;
  inscription: InscriptionRow;
  inscriptionDeposit: ChoreographyFinanceDetailLoaderData["inscriptionDeposit"];
  payments: PaymentRow[];
}) {
  const [open, setOpen] = useState(false);
  const hasInscriptionId = inscription.inscriptionId !== null;
  const undoableAllocation = inscription.undoableAllocation;
  const canChargeDeposit =
    inscriptionDeposit !== null &&
    inscriptionDeposit.priceRows.length > 0 &&
    inscription.state === "impaga" &&
    hasInscriptionId;
  const canChargeBalance =
    canPayInscriptionBalance &&
    inscription.state === "señada" &&
    inscription.balanceAmount !== null &&
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
          payments={payments}
        />
      );
    }
    if (canChargeBalance) {
      return (
        <InscriptionBalanceDialog
          inscription={inscription}
          open={open}
          onOpenChange={setOpen}
          payments={payments}
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
    id: "state",
    header: "Estado",
    cell: (inscription) => (
      <Badge
        variant={getChoreographyFinancialStateBadgeVariant(inscription.state)}
      >
        {formatChoreographyFinancialState(inscription.state)}
      </Badge>
    ),
  },
  {
    id: "basePrice",
    header: "Precio base",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cellClassName: (inscription) =>
      tentativeAmountClassName(inscription.state, "basePrice"),
    cell: (inscription) => formatInscriptionAmount(inscription.basePriceAmount),
  },
  {
    id: "deposit",
    header: "Seña",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cellClassName: (inscription) =>
      tentativeAmountClassName(inscription.state, "deposit"),
    cell: (inscription) => formatInscriptionAmount(inscription.depositAmount),
  },
  {
    id: "balance",
    header: "Saldo",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cellClassName: (inscription) =>
      tentativeAmountClassName(inscription.state, "balance"),
    cell: (inscription) => formatInscriptionAmount(inscription.balanceAmount),
  },
];

function tentativeAmountClassName(
  state: InscriptionRow["state"],
  column: InscriptionAmountColumn,
) {
  return isTentativeInscriptionAmount(state, column)
    ? "text-muted-foreground"
    : undefined;
}

function formatInscriptionAmount(amount: number | null) {
  return amount === null ? "Sin precio" : formatAmount(amount);
}

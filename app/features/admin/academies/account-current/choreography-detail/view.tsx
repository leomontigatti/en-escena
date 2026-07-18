import {
  AlertTriangle,
  Check,
  ChevronLeft,
  CircleDollarSign,
  Landmark,
  LoaderCircle,
  Receipt,
} from "lucide-react";
import { useState } from "react";
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
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
  SelectItem,
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
import { formatPaymentNumber } from "@/lib/finances/payment-number";
import { choreographyGroupTypeOptions } from "@/lib/portal/choreographies";

import {
  formatAmount,
  formatDate,
  formatOperationalAmount,
} from "../formatters";
import {
  formatDancerName,
  InscriptionCobroDialog,
} from "./inscription-cobro-dialog";
import type { loadAdministrativeChoreographyFinanceDetail } from "./server";
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
        choreography ? <CobroActions loaderData={loaderData} /> : undefined
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
            />
            <MetricCard
              icon={CircleDollarSign}
              title="Pagado"
              value={formatAmount(choreography.paidAmount)}
            />
            <MetricCard
              icon={Landmark}
              title="Saldo"
              value={formatOperationalAmount(choreography.balanceAmount)}
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
            backHref={`/administracion/finanzas/${loaderData.academy.id}`}
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
            No existen pagos con saldo suficiente para cubrir una etapa completa
            de esta coreografía.
          </AlertDescription>
        </Alert>
      ) : null}
    </AlertStack>
  );
}

function CobroActions({
  loaderData,
}: AdministracionCoreografiaFinancieraDetalleViewProps) {
  const stage = loaderData.stage;
  const eligible = eligiblePayments(loaderData.payments);
  const [open, setOpen] = useState(false);

  if (stage === null || eligible.length === 0) {
    return null;
  }

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
        >
          {stage === "deposit" ? "Pagar seña" : "Pagar saldo"}
        </DropdownMenuItem>
      </ResourceActionsMenu>
      <CobroDialog
        eligiblePayments={eligible}
        open={open}
        onOpenChange={setOpen}
        stage={stage}
      />
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
              value={selectedPaymentId ?? undefined}
              onValueChange={setSelectedPaymentId}
              disabled={isSaving}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elegí un pago" />
              </SelectTrigger>
              <SelectContent>
                {eligiblePayments.map((payment) => (
                  <SelectItem key={payment.id} value={payment.id}>
                    {formatPaymentNumber(payment.paymentNumber)} ·{" "}
                    {formatDate(payment.paymentDate)} · disponible{" "}
                    {formatAmount(payment.availableAmount)}
                  </SelectItem>
                ))}
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
  backHref,
  inscriptions,
  inscriptionDeposit,
  payments,
}: {
  backHref: string;
  inscriptions: InscriptionRow[];
  inscriptionDeposit: ChoreographyFinanceDetailLoaderData["inscriptionDeposit"];
  payments: PaymentRow[];
}) {
  const columns = buildInscriptionColumns({ inscriptionDeposit, payments });

  return (
    <Card aria-label="Inscripciones">
      <CardContent>
        <ClientDataTable
          rows={inscriptions}
          columns={columns}
          getRowKey={(inscription) => inscription.dancerId}
          searchPlaceholder="Buscar inscripción por bailarín"
          emptyMessage="No hay inscripciones para mostrar."
        />
      </CardContent>
      <CardFooter className="justify-between gap-3 border-0 bg-transparent pt-0">
        <Button asChild variant="outline">
          <Link to={backHref}>
            <ChevronLeft aria-hidden="true" data-icon="inline-start" />
            Volver
          </Link>
        </Button>
      </CardFooter>
    </Card>
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
          inscription={inscription}
          inscriptionDeposit={cobro.inscriptionDeposit}
          payments={cobro.payments}
        />
      ),
      filterValue: (inscription) => formatDancerName(inscription),
    },
    ...inscriptionAmountColumns,
  ];
}

/**
 * Nombre del bailarín. En una coreografía mixta, una inscripción `impaga`
 * huérfana lo muestra como botón que abre el diálogo de cobro de seña por fila.
 * Sin opciones de cobro (coreografía 100% `impaga` o inscripción ya congelada)
 * es solo texto.
 */
function DancerNameCell({
  inscription,
  inscriptionDeposit,
  payments,
}: {
  inscription: InscriptionRow;
  inscriptionDeposit: ChoreographyFinanceDetailLoaderData["inscriptionDeposit"];
  payments: PaymentRow[];
}) {
  const [open, setOpen] = useState(false);
  const canCharge =
    inscriptionDeposit !== null &&
    inscriptionDeposit.priceRows.length > 0 &&
    inscription.state === "impaga" &&
    inscription.inscriptionId !== null;

  if (!canCharge) {
    return <>{formatDancerName(inscription)}</>;
  }

  return (
    <>
      <button
        type="button"
        className="text-left font-medium text-primary underline-offset-4 hover:underline"
        onClick={() => setOpen(true)}
      >
        {formatDancerName(inscription)}
      </button>
      <InscriptionCobroDialog
        inscription={inscription}
        open={open}
        onOpenChange={setOpen}
        priceRows={inscriptionDeposit.priceRows}
        payments={payments}
      />
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

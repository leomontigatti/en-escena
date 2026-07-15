/**
 * PROTOTYPE-ONLY — throwaway UI for issue #276. Answers: ¿cómo debería
 * comportarse la UI administrativa del detalle financiero de una coreografía
 * para pagar seña/saldo, mientras la persistencia reparte internamente por
 * inscripciones (deposit/balance)?
 *
 * Variante elegida (A, "tabla protagonista") ya refinada. Incluye un control de
 * escenario para ejercitar los bordes (impaga / señada / mixta "necesita
 * atención" / sin pagos / pagada). No real data, no mutations reales: el guardar
 * transiciona estados en memoria para mostrar la reconstrucción post-acción.
 * Delete once folded into the real view.
 */
import {
  AlertTriangle,
  Check,
  CircleDollarSign,
  Info,
  Landmark,
  LoaderCircle,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { MetricCard } from "@/components/shared/metric-card";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/shared/utils";

import { formatAmount, formatDate } from "../formatters";

// ---------------------------------------------------------------------------
// Mock domain
// ---------------------------------------------------------------------------

type Stage = "impaga" | "señada" | "pagada";
type PayStage = "deposit" | "balance";

type MockInscription = {
  id: string;
  dancerName: string;
  basePriceAmount: number;
  depositAmount: number;
  discountPercentage: number;
  discountAmount: number;
  balanceAmount: number;
  finalPriceAmount: number;
  stage: Stage;
};

type MockPayment = {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  availableAmount: number;
  paymentMethod: string;
};

export type MockScenario = {
  key: string;
  label: string;
  academyName: string;
  choreographyName: string;
  inscriptions: MockInscription[];
  payments: MockPayment[];
};

function dancer(
  id: string,
  dancerName: string,
  stage: Stage,
  opts?: Partial<MockInscription>,
): MockInscription {
  const basePriceAmount = opts?.basePriceAmount ?? 30000;
  const depositAmount =
    opts?.depositAmount ?? Math.round(basePriceAmount * 0.3);
  const discountPercentage = opts?.discountPercentage ?? 0;
  const discountAmount =
    opts?.discountAmount ??
    Math.round(basePriceAmount * (discountPercentage / 100));
  const finalPriceAmount = basePriceAmount - discountAmount;
  const balanceAmount = finalPriceAmount - depositAmount;
  return {
    id,
    dancerName,
    basePriceAmount,
    depositAmount,
    discountPercentage,
    discountAmount,
    balanceAmount,
    finalPriceAmount,
    stage,
  };
}

function pay(
  id: string,
  paymentNumber: string,
  paymentDate: string,
  amount: number,
  availableAmount: number,
  paymentMethod: string,
): MockPayment {
  return {
    id,
    paymentNumber,
    paymentDate,
    amount,
    availableAmount,
    paymentMethod,
  };
}

export const SCENARIOS: MockScenario[] = [
  {
    key: "impaga",
    label: "Todas impagas",
    academyName: "Estudio Compás",
    choreographyName: "Reflejos — Jazz",
    inscriptions: [
      dancer("i1", "Ana Bianchi", "impaga"),
      dancer("i2", "Lucía Fernández", "impaga"),
      dancer("i3", "Martín Rossi", "impaga"),
      dancer("i4", "Sofía Paz", "impaga"),
    ],
    payments: [
      pay("p1", "PAG-0041", "2026-06-20", 40000, 40000, "Transferencia"),
      pay("p2", "PAG-0039", "2026-06-12", 12000, 12000, "Efectivo"),
    ],
  },
  {
    key: "senada",
    label: "Todas señadas",
    academyName: "Estudio Compás",
    choreographyName: "Reflejos — Jazz",
    inscriptions: [
      dancer("i1", "Ana Bianchi", "señada", { discountPercentage: 15 }),
      dancer("i2", "Lucía Fernández", "señada", { discountPercentage: 15 }),
      dancer("i3", "Martín Rossi", "señada", { discountPercentage: 15 }),
      dancer("i4", "Sofía Paz", "señada"),
    ],
    payments: [
      pay("p3", "PAG-0058", "2026-07-05", 200000, 180000, "Transferencia"),
      pay("p2", "PAG-0039", "2026-06-12", 12000, 12000, "Efectivo"),
    ],
  },
  {
    key: "mixta",
    label: "Mixta (necesita atención)",
    academyName: "Estudio Compás",
    choreographyName: "Reflejos — Jazz",
    inscriptions: [
      dancer("i1", "Ana Bianchi", "pagada", { discountPercentage: 15 }),
      dancer("i2", "Lucía Fernández", "señada", { discountPercentage: 15 }),
      dancer("i3", "Martín Rossi", "señada", { discountPercentage: 15 }),
      dancer("i4", "Sofía Paz", "impaga"),
    ],
    payments: [
      pay("p3", "PAG-0058", "2026-07-05", 200000, 90000, "Transferencia"),
      pay("p2", "PAG-0039", "2026-06-12", 12000, 12000, "Efectivo"),
    ],
  },
  {
    key: "sin-pagos",
    label: "Sin pagos suficientes",
    academyName: "Estudio Compás",
    choreographyName: "Reflejos — Jazz",
    inscriptions: [
      dancer("i1", "Ana Bianchi", "impaga"),
      dancer("i2", "Lucía Fernández", "impaga"),
      dancer("i3", "Martín Rossi", "impaga"),
      dancer("i4", "Sofía Paz", "impaga"),
    ],
    payments: [
      pay("p2", "PAG-0039", "2026-06-12", 12000, 8000, "Efectivo"),
      pay("p4", "PAG-0033", "2026-05-30", 15000, 5000, "Transferencia"),
    ],
  },
  {
    key: "pagada",
    label: "Todas pagadas",
    academyName: "Estudio Compás",
    choreographyName: "Reflejos — Jazz",
    inscriptions: [
      dancer("i1", "Ana Bianchi", "pagada", { discountPercentage: 15 }),
      dancer("i2", "Lucía Fernández", "pagada", { discountPercentage: 15 }),
      dancer("i3", "Martín Rossi", "pagada", { discountPercentage: 15 }),
      dancer("i4", "Sofía Paz", "pagada"),
    ],
    payments: [
      pay("p3", "PAG-0058", "2026-07-05", 200000, 20000, "Transferencia"),
    ],
  },
];

// ---------------------------------------------------------------------------
// Derivations (mirror docs/domain/pagos-inscripciones.md)
// ---------------------------------------------------------------------------

/** Estados mezclados que el flujo normal no resuelve en una sola acción. */
function needsAttention(ins: MockInscription[]): boolean {
  return new Set(ins.map((i) => i.stage)).size > 1;
}

const canPayDeposit = (ins: MockInscription[]) =>
  ins.length > 0 && ins.every((i) => i.stage === "impaga");
const canPayBalance = (ins: MockInscription[]) =>
  ins.length > 0 && ins.every((i) => i.stage === "señada");

const depositTotal = (ins: MockInscription[]) =>
  ins.reduce((sum, i) => sum + i.depositAmount, 0);
const balanceTotal = (ins: MockInscription[]) =>
  ins.reduce((sum, i) => sum + i.balanceAmount, 0);

// Seña adeudada: suma de señas pendientes de inscripciones impagas.
const senaAdeudada = (ins: MockInscription[]) =>
  ins
    .filter((i) => i.stage === "impaga")
    .reduce((sum, i) => sum + i.depositAmount, 0);

// Saldo adeudado: señas pendientes de impagas + saldos pendientes de señadas.
const saldoAdeudado = (ins: MockInscription[]) =>
  ins.reduce(
    (sum, i) =>
      sum +
      (i.stage === "impaga"
        ? i.depositAmount
        : i.stage === "señada"
          ? i.balanceAmount
          : 0),
    0,
  );

const paidTotal = (ins: MockInscription[]) =>
  ins.reduce(
    (sum, i) =>
      sum +
      (i.stage === "pagada"
        ? i.finalPriceAmount
        : i.stage === "señada"
          ? i.depositAmount
          : 0),
    0,
  );

const eligiblePayments = (payments: MockPayment[], total: number) =>
  payments.filter((p) => p.availableAmount >= total);

const money = (n: number) => formatAmount(n);
/** Importes adeudados: un guion cuando no se debe nada. */
const formatOwed = (n: number) => (n === 0 ? "$ -" : money(n));

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const stageBadge: Record<Stage, { label: string; variant: string }> = {
  impaga: { label: "Impaga", variant: "secondary" },
  señada: { label: "Señada", variant: "info" },
  pagada: { label: "Pagada", variant: "success" },
};

function StageBadge({ stage }: { stage: Stage }) {
  const b = stageBadge[stage];
  return <Badge variant={b.variant as never}>{b.label}</Badge>;
}

/** Alerta a nivel de página: solo mensaje, sin título. */
function PageAlert({
  variant = "warning",
  icon: Icon = AlertTriangle,
  children,
}: {
  variant?: "warning" | "info";
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <Alert variant={variant}>
      <Icon aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

/** Prototype-only scenario control — clearly NOT part of the design. */
export function ScenarioControl({
  scenarios,
  current,
  onChange,
}: {
  scenarios: MockScenario[];
  current: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-2 text-xs">
      <span className="px-1 font-medium text-amber-700 dark:text-amber-400">
        Escenario (prototipo):
      </span>
      {scenarios.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onChange(s.key)}
          className={cn(
            "rounded-md border px-2.5 py-1 transition-colors",
            s.key === current
              ? "border-foreground bg-foreground text-background"
              : "border-border hover:bg-muted",
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Refined detail (variante A)
// ---------------------------------------------------------------------------

export function ChoreographyFinanceDetailPrototype({
  scenario,
}: {
  scenario: MockScenario;
}) {
  // Estado en memoria para poder mostrar la reconstrucción post-guardado.
  const [inscriptions, setInscriptions] = useState(scenario.inscriptions);
  const [payments, setPayments] = useState(scenario.payments);
  const [dialogStage, setDialogStage] = useState<PayStage | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);

  const attention = needsAttention(inscriptions);
  const stage: PayStage | null = canPayDeposit(inscriptions)
    ? "deposit"
    : canPayBalance(inscriptions)
      ? "balance"
      : null;
  const allSenada = canPayBalance(inscriptions);
  const stageTotal =
    stage === "deposit"
      ? depositTotal(inscriptions)
      : stage === "balance"
        ? balanceTotal(inscriptions)
        : 0;
  const eligible = stage ? eligiblePayments(payments, stageTotal) : [];
  const hasAction = stage !== null && eligible.length > 0;
  const showNoPayments = stage !== null && eligible.length === 0;

  const dialogTotal =
    dialogStage === "deposit"
      ? depositTotal(inscriptions)
      : dialogStage === "balance"
        ? balanceTotal(inscriptions)
        : 0;
  const dialogEligible = dialogStage
    ? eligiblePayments(payments, dialogTotal)
    : [];

  function closeDialog() {
    if (isSaving) return;
    setDialogStage(null);
    setSelectedPaymentId(null);
  }

  function handleSave() {
    if (!selectedPaymentId || !dialogStage) return;
    setIsSaving(true);
    // Simula el intent: al resolver, transiciona estados y descuenta el pago,
    // luego reconstruye montos/alertas/estados desde el estado nuevo.
    window.setTimeout(() => {
      setPayments((prev) =>
        prev.map((p) =>
          p.id === selectedPaymentId
            ? { ...p, availableAmount: p.availableAmount - dialogTotal }
            : p,
        ),
      );
      setInscriptions((prev) =>
        prev.map((i) => {
          if (dialogStage === "deposit" && i.stage === "impaga") {
            return { ...i, stage: "señada" };
          }
          if (dialogStage === "balance" && i.stage === "señada") {
            return { ...i, stage: "pagada" };
          }
          return i;
        }),
      );
      setIsSaving(false);
      setDialogStage(null);
      setSelectedPaymentId(null);
    }, 700);
  }

  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      title={scenario.choreographyName}
      description="Revisá los importes, datos y participaciones vinculadas a esta coreografía."
      headerAction={
        hasAction ? (
          <ResourceActionsMenu contentClassName="w-48">
            {stage === "deposit" ? (
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setSelectedPaymentId(null);
                  setDialogStage("deposit");
                }}
              >
                Pagar seña
              </DropdownMenuItem>
            ) : null}
            {stage === "balance" ? (
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setSelectedPaymentId(null);
                  setDialogStage("balance");
                }}
              >
                Pagar saldo
              </DropdownMenuItem>
            ) : null}
          </ResourceActionsMenu>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-6">
        <AlertStack>
          {attention ? (
            <PageAlert variant="warning">
              Existen inscripciones que necesitan atención específica. Podés
              gestionarlas desde el link de cada una.
            </PageAlert>
          ) : null}

          {allSenada ? (
            <PageAlert variant="info" icon={Info}>
              El saldo de cada inscripción incluye el descuento por bailarín si
              correspondiera.
            </PageAlert>
          ) : null}

          {showNoPayments ? (
            <PageAlert variant="warning">
              No existen pagos con saldo suficiente para cubrir una etapa
              completa de esta coreografía.
            </PageAlert>
          ) : null}
        </AlertStack>

        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard
            icon={Receipt}
            title="Seña adeudada"
            value={formatOwed(senaAdeudada(inscriptions))}
          />
          <MetricCard
            icon={CircleDollarSign}
            title="Pagado"
            value={money(paidTotal(inscriptions))}
          />
          <MetricCard
            icon={Landmark}
            title="Saldo adeudado"
            value={formatOwed(saldoAdeudado(inscriptions))}
          />
        </section>

        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bailarín</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Precio base</TableHead>
                  <TableHead className="text-right">Seña</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inscriptions.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">
                      {i.dancerName}
                    </TableCell>
                    <TableCell>
                      <StageBadge stage={i.stage} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(i.basePriceAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {money(i.depositAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(i.balanceAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={dialogStage !== null}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent overlayClassName="backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>
              {dialogStage === "deposit" ? "Pagar seña" : "Pagar saldo"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Elegí el pago que cubre la etapa completa de la coreografía.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Pago a asignar</span>
            <Select
              value={selectedPaymentId ?? undefined}
              onValueChange={setSelectedPaymentId}
              disabled={isSaving}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elegí un pago" />
              </SelectTrigger>
              <SelectContent>
                {dialogEligible.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.paymentNumber} · {formatDate(p.paymentDate)} · disponible{" "}
                    {money(p.availableAmount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isSaving}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              onClick={handleSave}
              disabled={!selectedPaymentId || isSaving}
            >
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
        </DialogContent>
      </Dialog>
    </AdminResourceLayout>
  );
}

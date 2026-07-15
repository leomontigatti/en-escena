/**
 * PROTOTYPE-ONLY — throwaway UI for issue #277. Answers: ¿cómo se ve y funciona
 * la edición de roster de una coreografía **desde administración** (agregar /
 * quitar inscripciones, eliminar la coreografía), y cómo se reflejan sus
 * consecuencias financieras?
 *
 * Contexto de dominio (docs/domain/pagos-inscripciones.md, #273/#270/#272):
 *  - Solo el administrador edita el roster; sin bloqueo por coreografía, sin
 *    ciclo de solicitud/desbloqueo, sin motivos ni auditoría.
 *  - Quitar una inscripción = borrado físico + devolución de TODO lo asignado
 *    (seña y saldo) al `Saldo disponible` de la academia.
 *  - Agregar una inscripción nace `impaga`; si la coreografía ya está firmada,
 *    el precio se elige con un **piso** (no menor que el congelado más bajo).
 *  - Marca de agua: una coreografía `señada` NO vuelve a `impaga` al agregar una
 *    inscripción `impaga` (queda mixta → display "necesita atención").
 *  - Eliminar la coreografía libera todo lo asignado al `Saldo disponible`.
 *
 * Tres variantes estructuralmente distintas de la MISMA lógica de dominio,
 * conmutables por `?variant=A|B|C` (la reconstrucción financiera es compartida):
 *  - A "Acciones en la tabla": menús de acción inline por fila + header.
 *  - B "Modo edición de roster": toggle a un editor batch con footer de impacto.
 *  - C "Panel lateral": drawer de gestión de roster sobre el detalle read-only.
 *
 * No real data, no mutations reales: todo transiciona en memoria para mostrar la
 * reconstrucción post-acción. Delete once folded into the real view.
 */
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CircleDollarSign,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { MetricCard } from "@/components/shared/metric-card";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/shared/utils";

import { formatAmount } from "../formatters";

// ---------------------------------------------------------------------------
// Mock domain
// ---------------------------------------------------------------------------

type Stage = "impaga" | "señada" | "pagada";

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

export type MockScenario = {
  key: string;
  label: string;
  academyName: string;
  choreographyName: string;
  /** Saldo disponible de la academia en el evento, antes de tocar el roster. */
  availableAmount: number;
  inscriptions: MockInscription[];
};

let seq = 0;
function dancer(
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
    id: `i${(seq += 1)}`,
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

/** Bailarines candidatos a sumarse al roster (no incluidos aún). */
const DANCER_POOL = [
  "Valentina Ruiz",
  "Joaquín Sosa",
  "Camila Ledesma",
  "Tomás Vega",
  "Julia Ferreyra",
];

/** Filas de precio vigentes/históricas para el flujo extraordinario de alta. */
const PRICE_ROWS = [
  { id: "pr-early", label: "1.ª fecha (histórica)", amount: 24000 },
  { id: "pr-mid", label: "2.ª fecha", amount: 30000 },
  { id: "pr-late", label: "Fecha vigente", amount: 36000 },
];
const TENTATIVE_PRICE = 30000;

export const SCENARIOS: MockScenario[] = [
  {
    key: "impaga",
    label: "Todas impagas",
    academyName: "Estudio Compás",
    choreographyName: "Reflejos — Jazz",
    availableAmount: 18000,
    inscriptions: [
      dancer("Ana Bianchi", "impaga"),
      dancer("Lucía Fernández", "impaga"),
      dancer("Martín Rossi", "impaga"),
    ],
  },
  {
    key: "senada",
    label: "Todas señadas",
    academyName: "Estudio Compás",
    choreographyName: "Reflejos — Jazz",
    availableAmount: 5000,
    inscriptions: [
      dancer("Ana Bianchi", "señada", { discountPercentage: 15 }),
      dancer("Lucía Fernández", "señada", { discountPercentage: 15 }),
      dancer("Martín Rossi", "señada", { discountPercentage: 15 }),
      dancer("Sofía Paz", "señada"),
    ],
  },
  {
    key: "mixta",
    label: "Mixta (necesita atención)",
    academyName: "Estudio Compás",
    choreographyName: "Reflejos — Jazz",
    availableAmount: 12000,
    inscriptions: [
      dancer("Ana Bianchi", "pagada", { discountPercentage: 15 }),
      dancer("Lucía Fernández", "señada", { discountPercentage: 15 }),
      dancer("Martín Rossi", "impaga"),
    ],
  },
  {
    key: "una",
    label: "Una sola señada",
    academyName: "Estudio Compás",
    choreographyName: "Solo — Contemporáneo",
    availableAmount: 0,
    inscriptions: [dancer("Ana Bianchi", "señada")],
  },
];

// ---------------------------------------------------------------------------
// Derivations (mirror docs/domain/pagos-inscripciones.md)
// ---------------------------------------------------------------------------

/** Estados mezclados que el flujo normal no resuelve en una sola acción. */
function needsAttention(ins: MockInscription[]): boolean {
  return new Set(ins.map((i) => i.stage)).size > 1;
}

/**
 * Estado financiero de coreografía por marca de agua (no por mínimo). Nota: la
 * marca de agua real es persistente; acá se re-deriva del roster para el
 * prototipo, pero nunca "baja" de señada a impaga por composición mixta.
 */
function choreographyStage(ins: MockInscription[]): Stage {
  if (ins.length === 0) return "impaga";
  if (ins.every((i) => i.stage === "pagada")) return "pagada";
  if (ins.some((i) => i.stage === "señada" || i.stage === "pagada"))
    return "señada";
  return "impaga";
}

/** Monto que vuelve al Saldo disponible al quitar una inscripción. */
function returnedOnRemove(i: MockInscription): number {
  if (i.stage === "pagada") return i.finalPriceAmount;
  if (i.stage === "señada") return i.depositAmount;
  return 0;
}

// Seña adeudada: suma de señas pendientes de inscripciones impagas.
const senaAdeudada = (ins: MockInscription[]) =>
  ins
    .filter((i) => i.stage === "impaga")
    .reduce((sum, i) => sum + i.depositAmount, 0);

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

/** Piso de precio para altas en coreografía ya firmada (#270). */
function priceFloor(ins: MockInscription[]): number {
  const frozen = ins
    .filter((i) => i.stage === "señada" || i.stage === "pagada")
    .map((i) => i.basePriceAmount);
  return frozen.length ? Math.min(...frozen) : 0;
}

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

export const VARIANTS = [
  { key: "A", label: "Acciones en la tabla" },
  { key: "B", label: "Modo edición de roster" },
  { key: "C", label: "Panel lateral" },
] as const;

export type VariantKey = (typeof VARIANTS)[number]["key"];

/** Prototype-only floating variant switcher — obviously not part of design. */
export function VariantSwitcher({
  current,
  onChange,
}: {
  current: VariantKey;
  onChange: (key: VariantKey) => void;
}) {
  const idx = VARIANTS.findIndex((v) => v.key === current);
  const active = VARIANTS[idx] ?? VARIANTS[0];
  const cycle = (delta: number) =>
    onChange(VARIANTS[(idx + delta + VARIANTS.length) % VARIANTS.length].key);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      cycle(e.key === "ArrowRight" ? 1 : -1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center">
      <div className="flex items-center gap-1 rounded-full border border-border bg-background/95 px-1.5 py-1 shadow-lg backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => cycle(-1)}
          aria-label="Variante anterior"
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <span className="min-w-52 text-center text-sm font-medium">
          {active.key} — {active.label}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => cycle(1)}
          aria-label="Variante siguiente"
        >
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-inscription dialog (compartido por las tres variantes)
// ---------------------------------------------------------------------------

type AddPayload = { dancerName: string; basePriceAmount: number };

function AddInscriptionDialog({
  open,
  onOpenChange,
  takenNames,
  floor,
  frozen,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  takenNames: string[];
  /** Piso de precio (> 0 solo si la coreografía ya está firmada). */
  floor: number;
  /** Si la coreografía está firmada, el alta elige fila de precio con piso. */
  frozen: boolean;
  onConfirm: (payload: AddPayload) => void;
}) {
  const available = DANCER_POOL.filter((n) => !takenNames.includes(n));
  const [dancerName, setDancerName] = useState<string | null>(null);
  const [priceId, setPriceId] = useState<string | null>(null);

  const eligibleRows = PRICE_ROWS.filter((r) => r.amount >= floor);
  const chosenBase = frozen
    ? (PRICE_ROWS.find((r) => r.id === priceId)?.amount ?? null)
    : TENTATIVE_PRICE;
  const canConfirm = Boolean(dancerName) && (!frozen || chosenBase !== null);

  function reset() {
    setDancerName(null);
    setPriceId(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Agregar inscripción</DialogTitle>
          <DialogDescription>
            La nueva inscripción nace{" "}
            <span className="font-medium">impaga</span>.
            {frozen
              ? " Elegí la fila de precio; no puede ser menor al piso vigente."
              : " Toma el precio tentativo vigente mientras siga impaga."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Bailarín</span>
            <Select
              value={dancerName ?? undefined}
              onValueChange={setDancerName}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elegí un bailarín" />
              </SelectTrigger>
              <SelectContent>
                {available.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {frozen ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Fila de precio</span>
              <Select value={priceId ?? undefined} onValueChange={setPriceId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Elegí una fila de precio" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleRows.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label} · {money(r.amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                Piso: {money(floor)} (precio congelado más bajo de la
                coreografía).
              </span>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              Precio tentativo:{" "}
              <span className="font-medium tabular-nums">
                {money(TENTATIVE_PRICE)}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!canConfirm}
            onClick={() => {
              if (!dancerName || chosenBase === null) return;
              onConfirm({ dancerName, basePriceAmount: chosenBase });
              reset();
            }}
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Metrics + table (compartidos)
// ---------------------------------------------------------------------------

function FinanceMetrics({
  inscriptions,
  available,
}: {
  inscriptions: MockInscription[];
  available: number;
}) {
  return (
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
        icon={Wallet}
        title="Saldo disponible"
        value={money(available)}
      />
    </section>
  );
}

function StateAlerts({ inscriptions }: { inscriptions: MockInscription[] }) {
  if (inscriptions.length === 0) return null;
  const attention = needsAttention(inscriptions);
  return attention ? (
    <PageAlert variant="warning">
      Necesita atención: hay inscripciones en distinta etapa. La coreografía
      sigue <span className="font-medium">señada</span> por marca de agua; cada
      inscripción se resuelve por separado.
    </PageAlert>
  ) : null;
}

function EmptyRosterState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-1 py-10 text-center">
        <span className="text-sm font-medium">Coreografía eliminada</span>
        <span className="text-sm text-muted-foreground">
          Se eliminó físicamente y todo lo asignado volvió al Saldo disponible.
        </span>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared roster state (una sola lógica de dominio para las tres variantes)
// ---------------------------------------------------------------------------

type RosterState = {
  inscriptions: MockInscription[];
  available: number;
  deleted: boolean;
  choreoStage: Stage;
  floor: number;
  frozen: boolean;
  takenNames: string[];
  removeInscription: (id: string) => void;
  addInscription: (payload: AddPayload) => void;
  deleteChoreography: () => void;
};

function useRoster(scenario: MockScenario): RosterState {
  const [inscriptions, setInscriptions] = useState(scenario.inscriptions);
  const [available, setAvailable] = useState(scenario.availableAmount);
  const [deleted, setDeleted] = useState(false);

  function removeInscription(id: string) {
    const target = inscriptions.find((i) => i.id === id);
    if (!target) return;
    setAvailable((prev) => prev + returnedOnRemove(target));
    setInscriptions((prev) => prev.filter((i) => i.id !== id));
  }

  function addInscription({ dancerName, basePriceAmount }: AddPayload) {
    setInscriptions((prev) => [
      ...prev,
      dancer(dancerName, "impaga", { basePriceAmount }),
    ]);
  }

  function deleteChoreography() {
    setAvailable(
      (prev) =>
        prev + inscriptions.reduce((s, i) => s + returnedOnRemove(i), 0),
    );
    setInscriptions([]);
    setDeleted(true);
  }

  return {
    inscriptions,
    available,
    deleted,
    choreoStage: choreographyStage(inscriptions),
    floor: priceFloor(inscriptions),
    frozen: choreographyStage(inscriptions) !== "impaga",
    takenNames: inscriptions.map((i) => i.dancerName),
    removeInscription,
    addInscription,
    deleteChoreography,
  };
}

// ---------------------------------------------------------------------------
// Variante A — Acciones en la tabla (inline)
// ---------------------------------------------------------------------------

function VariantA({
  scenario,
  roster,
}: {
  scenario: MockScenario;
  roster: RosterState;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<MockInscription | null>(null);
  const [deleting, setDeleting] = useState(false);

  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      title={scenario.choreographyName}
      description="Revisá y editá el roster: agregá o quitá inscripciones, o eliminá la coreografía."
      headerAction={
        !roster.deleted ? (
          <ResourceActionsMenu contentClassName="w-56">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setAdding(true);
              }}
            >
              <Plus aria-hidden="true" data-icon="inline-start" />
              Agregar inscripción
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={(e) => {
                e.preventDefault();
                setDeleting(true);
              }}
            >
              <Trash2 aria-hidden="true" data-icon="inline-start" />
              Eliminar coreografía
            </DropdownMenuItem>
          </ResourceActionsMenu>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-6">
        <StateAlerts inscriptions={roster.inscriptions} />
        <FinanceMetrics
          inscriptions={roster.inscriptions}
          available={roster.available}
        />

        {roster.deleted ? (
          <EmptyRosterState />
        ) : (
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
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.inscriptions.map((i) => (
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
                      <TableCell className="text-right tabular-nums">
                        {money(i.depositAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {i.stage === "pagada" ? "—" : money(i.balanceAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <ResourceActionsMenu
                          size="icon"
                          contentClassName="w-48"
                        >
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={(e) => {
                              e.preventDefault();
                              setRemoving(i);
                            }}
                          >
                            <X aria-hidden="true" data-icon="inline-start" />
                            Quitar inscripción
                          </DropdownMenuItem>
                        </ResourceActionsMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <AddInscriptionDialog
        open={adding}
        onOpenChange={setAdding}
        takenNames={roster.takenNames}
        floor={roster.floor}
        frozen={roster.frozen}
        onConfirm={(p) => {
          roster.addInscription(p);
          setAdding(false);
        }}
      />

      <RemoveInscriptionConfirm
        inscription={removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        onConfirm={() => {
          if (removing) roster.removeInscription(removing.id);
          setRemoving(null);
        }}
      />

      <DeleteChoreographyConfirm
        open={deleting}
        released={roster.inscriptions.reduce(
          (s, i) => s + returnedOnRemove(i),
          0,
        )}
        onOpenChange={setDeleting}
        onConfirm={() => {
          roster.deleteChoreography();
          setDeleting(false);
        }}
      />
    </AdminResourceLayout>
  );
}

// ---------------------------------------------------------------------------
// Variante B — Modo edición de roster (batch con footer de impacto)
// ---------------------------------------------------------------------------

function VariantB({
  scenario,
  roster,
}: {
  scenario: MockScenario;
  roster: RosterState;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<MockInscription | null>(null);

  const pendingRelease = roster.inscriptions.reduce(
    (s, i) => s + returnedOnRemove(i),
    0,
  );

  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      title={scenario.choreographyName}
      description="Entrá en modo edición para reorganizar el roster de la coreografía."
      headerAction={
        !roster.deleted ? (
          <Button
            variant={editing ? "secondary" : "outline"}
            onClick={() => setEditing((v) => !v)}
          >
            <Pencil aria-hidden="true" data-icon="inline-start" />
            {editing ? "Salir de edición" : "Editar roster"}
          </Button>
        ) : undefined
      }
    >
      <div className={cn("flex flex-col gap-6", editing && "pb-24")}>
        <StateAlerts inscriptions={roster.inscriptions} />
        <FinanceMetrics
          inscriptions={roster.inscriptions}
          available={roster.available}
        />

        {roster.deleted ? (
          <EmptyRosterState />
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-3">
              {editing ? (
                <div className="flex flex-wrap gap-2">
                  {roster.inscriptions.map((i) => (
                    <span
                      key={i.id}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 py-1 pl-3 pr-1.5 text-sm"
                    >
                      <span className="font-medium">{i.dancerName}</span>
                      <StageBadge stage={i.stage} />
                      <button
                        type="button"
                        aria-label={`Quitar a ${i.dancerName}`}
                        onClick={() => setRemoving(i)}
                        className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X aria-hidden="true" className="size-4" />
                      </button>
                    </span>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => setAdding(true)}
                  >
                    <Plus aria-hidden="true" data-icon="inline-start" />
                    Agregar bailarín
                  </Button>
                </div>
              ) : (
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
                    {roster.inscriptions.map((i) => (
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
                        <TableCell className="text-right tabular-nums">
                          {money(i.depositAmount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {i.stage === "pagada" ? "—" : money(i.balanceAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {editing && !roster.deleted ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
            <span className="text-sm text-muted-foreground">
              Cada acción se aplica al instante y libera lo asignado al Saldo
              disponible. Total liberable si vaciás el roster:{" "}
              <span className="font-medium tabular-nums text-foreground">
                {money(pendingRelease)}
              </span>
              .
            </span>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Listo
            </Button>
          </div>
        </div>
      ) : null}

      <AddInscriptionDialog
        open={adding}
        onOpenChange={setAdding}
        takenNames={roster.takenNames}
        floor={roster.floor}
        frozen={roster.frozen}
        onConfirm={(p) => {
          roster.addInscription(p);
          setAdding(false);
        }}
      />

      <RemoveInscriptionConfirm
        inscription={removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        onConfirm={() => {
          if (removing) roster.removeInscription(removing.id);
          setRemoving(null);
        }}
      />
    </AdminResourceLayout>
  );
}

// ---------------------------------------------------------------------------
// Variante C — Panel lateral (drawer de gestión sobre el detalle read-only)
// ---------------------------------------------------------------------------

function VariantC({
  scenario,
  roster,
}: {
  scenario: MockScenario;
  roster: RosterState;
}) {
  const [managing, setManaging] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<MockInscription | null>(null);
  const [deleting, setDeleting] = useState(false);

  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      title={scenario.choreographyName}
      description="El detalle financiero es de solo lectura; la gestión del roster vive en un panel aparte."
      headerAction={
        !roster.deleted ? (
          <Button variant="outline" onClick={() => setManaging(true)}>
            <Pencil aria-hidden="true" data-icon="inline-start" />
            Gestionar roster
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-6">
        <StateAlerts inscriptions={roster.inscriptions} />
        <FinanceMetrics
          inscriptions={roster.inscriptions}
          available={roster.available}
        />

        {roster.deleted ? (
          <EmptyRosterState />
        ) : (
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
                  {roster.inscriptions.map((i) => (
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
                      <TableCell className="text-right tabular-nums">
                        {money(i.depositAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {i.stage === "pagada" ? "—" : money(i.balanceAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Sheet open={managing} onOpenChange={setManaging}>
        <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Gestionar roster</SheetTitle>
            <SheetDescription>
              Agregá o quitá inscripciones. Quitar libera lo asignado al Saldo
              disponible.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4">
            {roster.inscriptions.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{i.dancerName}</span>
                  <span className="text-xs text-muted-foreground">
                    {returnedOnRemove(i) > 0
                      ? `Al quitar libera ${money(returnedOnRemove(i))}`
                      : "Sin monto asignado"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StageBadge stage={i.stage} />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar a ${i.dancerName}`}
                    onClick={() => setRemoving(i)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              className="mt-1"
              onClick={() => setAdding(true)}
            >
              <Plus aria-hidden="true" data-icon="inline-start" />
              Agregar inscripción
            </Button>
          </div>

          <SheetFooter>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => setDeleting(true)}
            >
              <Trash2 aria-hidden="true" data-icon="inline-start" />
              Eliminar coreografía
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AddInscriptionDialog
        open={adding}
        onOpenChange={setAdding}
        takenNames={roster.takenNames}
        floor={roster.floor}
        frozen={roster.frozen}
        onConfirm={(p) => {
          roster.addInscription(p);
          setAdding(false);
        }}
      />

      <RemoveInscriptionConfirm
        inscription={removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        onConfirm={() => {
          if (removing) roster.removeInscription(removing.id);
          setRemoving(null);
        }}
      />

      <DeleteChoreographyConfirm
        open={deleting}
        released={roster.inscriptions.reduce(
          (s, i) => s + returnedOnRemove(i),
          0,
        )}
        onOpenChange={setDeleting}
        onConfirm={() => {
          roster.deleteChoreography();
          setDeleting(false);
          setManaging(false);
        }}
      />
    </AdminResourceLayout>
  );
}

// ---------------------------------------------------------------------------
// Confirmaciones destructivas (sin motivos, per #272)
// ---------------------------------------------------------------------------

function RemoveInscriptionConfirm({
  inscription,
  onOpenChange,
  onConfirm,
}: {
  inscription: MockInscription | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const released = inscription ? returnedOnRemove(inscription) : 0;
  return (
    <AlertDialog open={inscription !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            ¿Quitar a {inscription?.dancerName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Se elimina físicamente la inscripción.{" "}
            {released > 0
              ? `Vuelven ${money(released)} al Saldo disponible de la academia.`
              : "No tenía monto asignado, así que no cambia el Saldo disponible."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Quitar inscripción
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteChoreographyConfirm({
  open,
  released,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  released: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar la coreografía?</AlertDialogTitle>
          <AlertDialogDescription>
            Se elimina físicamente junto con todas sus inscripciones.{" "}
            {released > 0
              ? `Vuelven ${money(released)} al Saldo disponible de la academia.`
              : "No hay montos asignados para devolver."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Eliminar coreografía
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Root — elige variante y comparte la lógica de roster en memoria
// ---------------------------------------------------------------------------

export function RosterEditPrototype({
  scenario,
  variant,
}: {
  scenario: MockScenario;
  variant: VariantKey;
}) {
  const roster = useRoster(scenario);
  if (variant === "B") return <VariantB scenario={scenario} roster={roster} />;
  if (variant === "C") return <VariantC scenario={scenario} roster={roster} />;
  return <VariantA scenario={scenario} roster={roster} />;
}

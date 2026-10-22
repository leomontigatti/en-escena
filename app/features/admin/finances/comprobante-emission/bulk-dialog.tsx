import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CircleStop, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { useFetcher } from "react-router";
import { z } from "zod";

import { BulkRunDialog } from "@/components/shared/bulk-run-dialog";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContingencyAlert } from "@/lib/comprobantes/contingency-alert";
import {
  comprobanteKindCbteTipo,
  formatComprobanteKindLabel,
} from "@/lib/comprobantes/kind";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatAmount } from "@/lib/finances/formatters";

import {
  bulkChoreographyIdField,
  describeBulkDuration,
  resolveBulkCbteFchBounds,
  type BulkEmission,
  type BulkEmissionActionData,
  type BulkEmissionPlan,
} from "./bulk";
import {
  beginBulkEmission,
  bulkRunProgress,
  isBulkRunHeld,
  nextBulkEmission,
  settleBulkEmission,
  startBulkRun,
  stopBulkRun,
  unemittedBulkIds,
  updateBulkHalt,
  type BulkRowState,
  type BulkRun,
} from "./bulk-run";
import {
  abandonReservationIntent,
  emitComprobanteConfirmValue,
  emitComprobanteIntent,
  recheckComprobanteIntent,
} from "./shared";

type BulkChoreography = {
  id: string;
  choreographyNumber: number | null;
  name: string;
};

type ReadyPlan = Extract<BulkEmissionPlan, { status: "ready" }>;

/**
 * `Emitir comprobantes` (#617, #1712): the plan of what each selected
 * choreography would emit, with the ones left out and why, which once
 * confirmed becomes the run's progress in the same dialog.
 *
 * The run is the browser's: one `emit-comprobante` request per choreography,
 * one after the other, to the list's own action. Its state is `bulk-run.ts`;
 * this component sends the request it names and settles it with the answer.
 */
export function BulkEmissionDialog({
  bulkEmission,
  choreographies,
  onOpenChange,
  open,
  selectedIds,
}: {
  bulkEmission: BulkEmission;
  // The list's choreographies, in its order, to name the rows by.
  choreographies: readonly BulkChoreography[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  selectedIds: readonly string[];
}) {
  // What the plan covers: the selection, then what a retry leaves.
  const [ids, setIds] = useState(() => [...selectedIds]);
  const [run, setRun] = useState<BulkRun | null>(null);
  // The run's one date, the same on every request.
  const [cbteFch, setCbteFch] = useState("");
  const emission = useBulkEmissionLoop({ cbteFch, run, setRun });
  const selection = planSelection({ bulkEmission, choreographies, ids });
  const form = useForm<BulkDateValues>({
    resolver: zodResolver(bulkDateSchema(selection.bounds)),
    defaultValues: { cbteFch: bulkEmission.cbteFch.today },
  });

  // One dialog throughout, so confirming turns the plan into the progress
  // without closing and reopening.
  return (
    <BulkRunDialog
      busy={
        run?.phase === "running" ||
        run?.phase === "stopping" ||
        emission.isResolving
      }
      onOpenChange={onOpenChange}
      open={open}
      {...(run
        ? progressDialog({
            emission,
            onRetry: () => {
              // Planned again from the list as it reads now: what emitted
              // since owes nothing and is not asked twice.
              setIds(unemittedBulkIds(run));
              setRun(null);
            },
            onStop: () => setRun((current) => current && stopBulkRun(current)),
            rows: selection.rows,
            run,
          })
        : planDialog({
            form,
            onStart: (date) => {
              setCbteFch(date);
              setRun(startBulkRun(selection.planned));
            },
            selection,
            today: bulkEmission.cbteFch.today,
          }))}
    />
  );
}

type BulkDialogContent = Omit<
  ComponentProps<typeof BulkRunDialog>,
  "busy" | "onOpenChange" | "open"
>;

type BulkSelection = ReturnType<typeof planSelection>;

// The selected choreographies with what each would emit, and the date bounds
// over the series those emissions go out in.
function planSelection(input: {
  bulkEmission: BulkEmission;
  choreographies: readonly BulkChoreography[];
  ids: readonly string[];
}) {
  // By number, the order the list opens in, which is the order the run
  // emits in; one with no number yet goes last.
  const rows = input.choreographies
    .filter((choreography) => input.ids.includes(choreography.id))
    .sort(
      (left, right) =>
        (left.choreographyNumber ?? Infinity) -
          (right.choreographyNumber ?? Infinity) ||
        left.name.localeCompare(right.name),
    );
  const planned = rows.map(({ id }) => ({
    id,
    plan: input.bulkEmission.plans[id] ?? {
      status: "skipped" as const,
      reasons: ["No encontramos la coreografía."],
    },
  }));
  const ready = planned.flatMap(({ plan }) =>
    plan.status === "ready" ? [plan] : [],
  );

  return {
    bounds: resolveBulkCbteFchBounds(
      input.bulkEmission.cbteFch,
      ready.map((plan) => plan.kind),
    ),
    planned,
    ready,
    rows,
  };
}

function planDialog({
  form,
  onStart,
  selection,
  today,
}: {
  form: UseFormReturn<BulkDateValues>;
  onStart: (cbteFch: string) => void;
  selection: BulkSelection;
  today: string;
}): BulkDialogContent {
  const { bounds, planned, ready, rows } = selection;

  return {
    actions:
      ready.length > 0 ? (
        <Button type="submit">
          <Check aria-hidden="true" data-icon="inline-start" />
          Emitir
        </Button>
      ) : null,
    cancelLabel: "Cancelar",
    description: describePlan(ready.length),
    onSubmit: (event) =>
      void form.handleSubmit((values) => onStart(values.cbteFch))(event),
    title: "¿Emitir los comprobantes?",
    children: (
      <>
        <BulkTable
          plans={Object.fromEntries(planned.map(({ id, plan }) => [id, plan]))}
          rows={rows}
          states={Object.fromEntries(
            planned.map(({ id, plan }) => [id, toPlannedState(plan)]),
          )}
        />
        {ready.length > 0 ? <PlanTotals ready={ready} /> : null}
        {bounds ? (
          <DateOnlyField
            calendarBounds={{
              defaultMonth: parseDateOnly(today),
              startMonth: parseDateOnly(bounds.floor),
              endMonth: parseDateOnly(bounds.max),
              earliestSelectableDate: parseDateOnly(bounds.floor),
              latestSelectableDate: parseDateOnly(bounds.max),
            }}
            control={form.control}
            label="Fecha de los comprobantes"
            name="cbteFch"
          />
        ) : null}
      </>
    ),
  };
}

function progressDialog({
  emission,
  onRetry,
  onStop,
  rows,
  run,
}: {
  emission: BulkEmissionLoop;
  onRetry: () => void;
  onStop: () => void;
  rows: readonly BulkChoreography[];
  run: BulkRun;
}): BulkDialogContent {
  const { settled, total } = bulkRunProgress(run);
  const done = run.phase === "done";
  const held = isBulkRunHeld(run);
  // What a retry would try again, offered once nothing holds its series.
  const left =
    !held &&
    run.ids.some((id) => ["failed", "untried"].includes(run.rows[id].status));

  return {
    actions: done ? (
      left ? (
        <Button type="button" disabled={emission.isResolving} onClick={onRetry}>
          <RotateCcw aria-hidden="true" data-icon="inline-start" />
          Reintentar las que faltan
        </Button>
      ) : null
    ) : (
      <StopButton stopping={run.phase === "stopping"} onStop={onStop} />
    ),
    cancelLabel: done ? "Cerrar" : null,
    description: `${settled} de ${total}. ${describeProgress({ done, held, left })}`,
    title: describeProgressTitle(run, held),
    children: (
      <>
        {run.halt ? (
          <ContingencyAlert
            abandonIntent={abandonReservationIntent}
            contingency={run.halt.contingency}
            isBusy={emission.isResolving}
            onSubmit={(payload) =>
              emission.resolve(run.halt?.choreographyId ?? "", payload)
            }
            recheckIntent={recheckComprobanteIntent}
          />
        ) : null}
        <BulkTable plans={run.plans} rows={rows} states={run.rows} />
      </>
    ),
  };
}

// It stops after the choreography in flight: ARCA may authorize a request
// already sent, so nothing cancels it (ADR-0012).
function StopButton({
  onStop,
  stopping,
}: {
  onStop: () => void;
  stopping: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={stopping}
      onClick={onStop}
    >
      {stopping ? (
        <Spinner aria-hidden="true" data-icon="inline-start" />
      ) : (
        <CircleStop aria-hidden="true" data-icon="inline-start" />
      )}
      Detener
    </Button>
  );
}

function describeProgressTitle(run: BulkRun, held: boolean): string {
  if (run.phase !== "done") {
    return "Emitiendo los comprobantes";
  }

  return held || run.ids.some((id) => run.rows[id].status === "untried")
    ? "Emisión detenida"
    : "Emisión terminada";
}

/**
 * The loop: whenever the run names a next choreography and nothing is in
 * flight, it posts it; when the answer arrives, it settles that row. What it
 * sends is the confirmed plan the run holds, not the list's latest reading,
 * which revalidates after every emission: the emitter refuses a document that
 * changed since, row by row.
 */
function useBulkEmissionLoop({
  cbteFch,
  run,
  setRun,
}: {
  cbteFch: string;
  run: BulkRun | null;
  setRun: (update: (current: BulkRun | null) => BulkRun | null) => void;
}) {
  const fetcher = useFetcher<BulkEmissionActionData>();
  const resolver = useFetcher<BulkEmissionActionData>();
  // The answer already settled, so a revalidation that leaves the fetcher
  // idle with the same data does not settle the next row with it.
  const settled = useRef<BulkEmissionActionData | undefined>(undefined);
  const inFlight = run?.ids.find((id) => run.rows[id].status === "emitting");
  const next = run ? nextBulkEmission(run) : null;
  const nextPlan = next ? run?.plans[next] : undefined;

  useEffect(() => {
    const answer = fetcher.data;

    if (
      fetcher.state === "idle" &&
      inFlight &&
      answer &&
      answer !== settled.current
    ) {
      settled.current = answer;
      setRun(
        (current) => current && settleBulkEmission(current, inFlight, answer),
      );
    }
  }, [fetcher.state, fetcher.data, inFlight, setRun]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !next || nextPlan?.status !== "ready") {
      return;
    }

    setRun((current) => current && beginBulkEmission(current, next));
    void fetcher.submit(
      {
        intent: emitComprobanteIntent,
        confirm: emitComprobanteConfirmValue,
        [bulkChoreographyIdField]: next,
        kind: nextPlan.kind,
        amount: String(nextPlan.amount),
        cbteFch,
      },
      { method: "post" },
    );
  }, [cbteFch, fetcher, next, nextPlan, setRun]);

  useEffect(() => {
    const answer = resolver.data;

    if (resolver.state === "idle" && answer?.status === "warning") {
      setRun(
        (current) => current && updateBulkHalt(current, answer.contingency),
      );
    }
  }, [resolver.state, resolver.data, setRun]);

  return {
    isResolving: resolver.state !== "idle",
    // Re-checking or abandoning the attempt that halted the run, for the
    // choreography it was emitting.
    resolve(choreographyId: string, payload: Record<string, string>) {
      void resolver.submit(
        { ...payload, [bulkChoreographyIdField]: choreographyId },
        { method: "post" },
      );
    },
  };
}

function describeProgress(state: {
  done: boolean;
  held: boolean;
  left: boolean;
}): string {
  if (!state.done) {
    return "No cierres esta pestaña mientras se emiten.";
  }

  if (state.held) {
    return "Se detuvo en un comprobante sin resolver: verificalo o abandonalo para seguir con los que faltan.";
  }

  return state.left
    ? "Lo que falta se puede volver a intentar: lo ya emitido no se repite."
    : "Se emitió todo lo planeado.";
}

type BulkEmissionLoop = ReturnType<typeof useBulkEmissionLoop>;

function describePlan(count: number): string {
  if (count === 0) {
    return "Ninguna de las coreografías elegidas debe un comprobante.";
  }

  const emitted =
    count === 1
      ? "Se emite 1 comprobante."
      : `Se emiten ${count} comprobantes, uno por coreografía y en este orden.`;

  return `${emitted} ${describeBulkDuration(count)} No cierres esta pestaña mientras se emiten: cerrarla corta la emisión. Cada comprobante es definitivo: solo una nota puede corregirlo.`;
}

function BulkTable({
  plans,
  rows,
  states,
}: {
  plans: Record<string, BulkEmissionPlan>;
  rows: readonly BulkChoreography[];
  states: Record<string, BulkRowState>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Coreografía</TableHead>
          <TableHead>Comprobante</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const plan = plans[row.id];

          return (
            <TableRow key={row.id}>
              <TableCell className="font-medium whitespace-normal">
                {row.choreographyNumber === null
                  ? row.name
                  : `${formatEventSequenceNumber(row.choreographyNumber)} ${row.name}`}
              </TableCell>
              <TableCell>
                {plan?.status === "ready" ? (
                  <div className="flex flex-col">
                    <span>
                      {formatComprobanteKindLabel(
                        comprobanteKindCbteTipo(plan.kind),
                      )}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatAmount(plan.amount)}
                    </span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="whitespace-normal">
                <BulkRowStatus state={states[row.id]} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function BulkRowStatus({ state }: { state: BulkRowState | undefined }) {
  switch (state?.status) {
    case "emitting":
      return (
        <span className="inline-flex items-center gap-2">
          <Spinner aria-hidden="true" />
          Emitiendo
        </span>
      );
    case "emitted":
      return (
        <div className="flex flex-col items-start gap-1">
          <Badge variant="success">Emitida</Badge>
          <span className="text-xs text-muted-foreground tabular-nums">
            N° {state.number}
          </span>
        </div>
      );
    case "failed":
      return <ReasonedBadge label="Falló" reasons={[state.message]} />;
    case "skipped":
      return (
        <ReasonedBadge
          label="Salteada"
          reasons={state.reasons}
          variant="secondary"
        />
      );
    case "untried":
      return <Badge variant="outline">Sin intentar</Badge>;
    default:
      return <Badge variant="outline">Pendiente</Badge>;
  }
}

function ReasonedBadge({
  label,
  reasons,
  variant = "destructive",
}: {
  label: string;
  reasons: string[];
  variant?: "destructive" | "secondary";
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant={variant}>{label}</Badge>
      <span className="text-xs text-muted-foreground">{reasons.join(" ")}</span>
    </div>
  );
}

// Billed and credited apart: a credit note is money going the other way, and
// one sum over both would name a figure no document carries.
function PlanTotals({ ready }: { ready: readonly ReadyPlan[] }) {
  const billed = sumReady(ready, (kind) => kind !== "nota_credito_c");
  const credited = sumReady(ready, (kind) => kind === "nota_credito_c");

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/50 px-3 py-2">
      {billed > 0 ? <TotalRow label="Total a facturar" value={billed} /> : null}
      {credited > 0 ? (
        <TotalRow label="Total a acreditar" value={credited} />
      ) : null}
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">
        {formatAmount(value)}
      </span>
    </div>
  );
}

function sumReady(
  ready: readonly ReadyPlan[],
  include: (kind: ReadyPlan["kind"]) => boolean,
): number {
  return ready.reduce(
    (sum, plan) => (include(plan.kind) ? sum + plan.amount : sum),
    0,
  );
}

function toPlannedState(plan: BulkEmissionPlan): BulkRowState {
  return plan.status === "ready"
    ? { status: "pending" }
    : { status: "skipped", reasons: plan.reasons };
}

type BulkDateValues = z.input<ReturnType<typeof bulkDateSchema>>;

// The bounds every emission of the run is checked against again, so a date
// one of them would refuse is caught before the run starts.
function bulkDateSchema(bounds: ReturnType<typeof resolveBulkCbteFchBounds>) {
  return z.object({
    cbteFch: z
      .string()
      .min(1, "Este campo es obligatorio.")
      .refine((value) => !bounds || value <= bounds.max, {
        message: "La fecha no puede ser posterior a hoy.",
      })
      .refine((value) => !bounds || value >= bounds.floor, {
        message: `La fecha no puede ser anterior al ${bounds?.description ?? ""}.`,
      }),
  });
}

// A business date `AAAA-MM-DD` as the calendar's local midnight.
function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day);
}

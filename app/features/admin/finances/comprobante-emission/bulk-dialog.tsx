import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CircleStop, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { useFetcher } from "react-router";

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
import { isThrownActionResult } from "@/lib/shared/recoverable-client-action";
import { useServerActionToast } from "@/lib/shared/toasts";

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
  type BulkEmissionAnswer,
  type BulkRowState,
  type BulkRun,
} from "./bulk-run";
import {
  emissionCalendarBounds,
  emissionDateSchema,
  type EmissionDateValues,
} from "./emission-date";
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
  const form = useForm<EmissionDateValues>({
    resolver: zodResolver(emissionDateSchema(selection.bounds)),
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
  form: UseFormReturn<EmissionDateValues>;
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
          <div className="flex flex-col gap-2">
            <DateOnlyField
              calendarBounds={emissionCalendarBounds(today, bounds)}
              control={form.control}
              label="Fecha de los comprobantes"
              name="cbteFch"
            />
            {/* The floor is said, not only enforced by the calendar: one
                series' last date can hold back the whole run. */}
            <p className="text-sm text-muted-foreground">
              No puede ser anterior al {bounds.description}.
            </p>
          </div>
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
    description: `${settled} de ${total}. ${describeProgress({
      done,
      held,
      left,
      remaining: total - settled,
    })}`,
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
  // The request in flight, and whether its submit has finished: a row is
  // settled by the request it sent, never by comparing answers, since two
  // requests may answer with the very same object (the generic failure).
  const request = useRef<{ id: string; finished: boolean } | null>(null);
  const [finishedRequests, setFinishedRequests] = useState(0);
  const next = run ? nextBulkEmission(run) : null;
  const nextPlan = next ? run?.plans[next] : undefined;

  useEffect(() => {
    const sent = request.current;

    if (!sent?.finished || fetcher.state !== "idle") {
      return;
    }

    request.current = null;
    const answer = toBulkAnswer(fetcher.data);
    setRun(
      (current) => current && settleBulkEmission(current, sent.id, answer),
    );
  }, [fetcher.state, fetcher.data, finishedRequests, setRun]);

  useEffect(() => {
    if (
      request.current ||
      fetcher.state !== "idle" ||
      !next ||
      nextPlan?.status !== "ready"
    ) {
      return;
    }

    const sent = { id: next, finished: false };
    request.current = sent;
    setRun((current) => current && beginBulkEmission(current, next));
    void fetcher
      .submit(
        {
          intent: emitComprobanteIntent,
          confirm: emitComprobanteConfirmValue,
          [bulkChoreographyIdField]: next,
          kind: nextPlan.kind,
          amount: String(nextPlan.amount),
          cbteFch,
        },
        { method: "post" },
      )
      .finally(() => {
        sent.finished = true;
        setFinishedRequests((count) => count + 1);
      });
  }, [cbteFch, fetcher, next, nextPlan, setRun]);

  useEffect(() => {
    const answer = resolver.data;

    if (resolver.state === "idle" && answer?.status === "warning") {
      setRun(
        (current) => current && updateBulkHalt(current, answer.contingency),
      );
    }
  }, [resolver.state, resolver.data, setRun]);

  // A re-check or an abandon refused says why, like the detail's dialog: the
  // halt keeps its last contingency, and the operator can try again.
  useServerActionToast(
    resolver.state === "idle" && resolver.data?.status === "error"
      ? resolver.data
      : null,
    { toastId: "bulk-emission:error" },
  );

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
  remaining: number;
}): string {
  if (!state.done) {
    return `${describeBulkDuration(state.remaining)} No cierres esta pestaña mientras se emiten.`;
  }

  if (state.held) {
    return "Se detuvo en un comprobante sin resolver: verificalo o abandonalo para seguir con los que faltan.";
  }

  return state.left
    ? "Lo que falta se puede volver a intentar: lo ya emitido no se repite."
    : "Se emitió todo lo planeado.";
}

type BulkEmissionLoop = ReturnType<typeof useBulkEmissionLoop>;

// A request that came back with no answer of its own — the generic failure
// the route's client action turns a throw into, or none at all — left its
// outcome at ARCA unknown.
function toBulkAnswer(
  data: BulkEmissionActionData | undefined,
): BulkEmissionAnswer {
  return data === undefined || isThrownActionResult(data)
    ? { status: "lost" }
    : data;
}

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
    // Two columns, so the narrow dialog gives the name and the reason most of
    // its width: what a row emits reads under its name. Framed like the
    // list's own tables.
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/2">Coreografía</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const plan = plans[row.id];

            return (
              <TableRow key={row.id}>
                <TableCell className="align-top whitespace-normal">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">
                      {row.choreographyNumber === null
                        ? row.name
                        : `${formatEventSequenceNumber(row.choreographyNumber)} ${row.name}`}
                    </span>
                    {plan?.status === "ready" ? (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatComprobanteKindLabel(
                          comprobanteKindCbteTipo(plan.kind),
                        )}{" "}
                        · {formatAmount(plan.amount)}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <BulkRowStatus state={states[row.id]} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
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

import {
  resolveContingencySubmitState,
  type ComprobanteContingency,
} from "@/lib/comprobantes/contingency-alert";

import type { BulkEmissionActionData, BulkEmissionPlan } from "./bulk";

/*
 * The state of a bulk emission once it runs (#617 §4): one row per selected
 * choreography, each moving from `pendiente` through `emitiendo` to `emitida`
 * or `falló`, the excluded ones `salteada` from the start. Pure, so the dialog
 * only sends the request `nextBulkEmission` names and settles it with what
 * the server answered.
 *
 * Two things stop it before the end, and both leave the rows they never
 * reached `sin intentar`: `Detener`, which lets the emission in flight finish
 * since ARCA may authorize it anyway (ADR-0012), and a series left with a live
 * reservation, which every later emission in it would meet.
 */

export type BulkRowState =
  | { status: "skipped"; reasons: string[] }
  | { status: "pending" }
  | { status: "emitting" }
  | { status: "emitted"; number: string; recovered: boolean }
  | { status: "failed"; message: string }
  | { status: "untried" };

export type BulkRun = {
  phase: "running" | "stopping" | "done";
  // The selection, in the order it is listed and emitted.
  ids: string[];
  // What each row was confirmed to emit: the one sent, whatever the list
  // reads by the time its turn comes, since the emitter refuses a change.
  plans: Record<string, BulkEmissionPlan>;
  rows: Record<string, BulkRowState>;
  // The live reservation that halted the run, for the contingency alert.
  halt: { choreographyId: string; contingency: ComprobanteContingency } | null;
};

export function startBulkRun(
  selection: ReadonlyArray<{ id: string; plan: BulkEmissionPlan }>,
): BulkRun {
  return settleIfIdle({
    phase: "running",
    ids: selection.map(({ id }) => id),
    plans: Object.fromEntries(selection.map(({ id, plan }) => [id, plan])),
    rows: Object.fromEntries(
      selection.map(({ id, plan }) => [
        id,
        plan.status === "ready"
          ? { status: "pending" }
          : { status: "skipped", reasons: plan.reasons },
      ]),
    ),
    halt: null,
  });
}

/** The choreography to emit next, `null` while one is in flight or once it stops. */
export function nextBulkEmission(run: BulkRun): string | null {
  if (run.phase !== "running" || findRow(run, "emitting")) {
    return null;
  }

  return findRow(run, "pending");
}

export function beginBulkEmission(run: BulkRun, id: string): BulkRun {
  return withRow(run, id, { status: "emitting" });
}

export function settleBulkEmission(
  run: BulkRun,
  id: string,
  answer: BulkEmissionActionData,
): BulkRun {
  if (answer.status === "emitted") {
    return settleIfIdle(withRow(run, id, answer));
  }

  if (answer.status === "error") {
    return settleIfIdle(
      withRow(run, id, { status: "failed", message: answer.message }),
    );
  }

  const { contingency } = answer;

  // A rejection or an attempt that never reached ARCA frees its number, and
  // the next choreography takes it; a live reservation holds the series, and
  // the alert above the rows tells it in full.
  if (resolveContingencySubmitState(contingency) === "blocked") {
    return settleIfIdle({
      ...withRow(run, id, {
        status: "failed",
        message: "Quedó sin resolver en ARCA: ver el aviso.",
      }),
      phase: "stopping",
      halt: { choreographyId: id, contingency },
    });
  }

  return settleIfIdle(
    withRow(run, id, {
      status: "failed",
      message: "message" in contingency ? contingency.message : "",
    }),
  );
}

/**
 * Whether the run's halt still holds its series: until the attempt is
 * re-checked or abandoned, retrying would only meet it again.
 */
export function isBulkRunHeld(run: BulkRun): boolean {
  return (
    run.halt !== null &&
    resolveContingencySubmitState(run.halt.contingency) === "blocked"
  );
}

/** `Detener`: the emission in flight finishes, no other starts. */
export function stopBulkRun(run: BulkRun): BulkRun {
  return run.phase === "running"
    ? settleIfIdle({ ...run, phase: "stopping" })
    : run;
}

/** What the re-checking or abandoning of the halting attempt answered. */
export function updateBulkHalt(
  run: BulkRun,
  contingency: ComprobanteContingency,
): BulkRun {
  return run.halt ? { ...run, halt: { ...run.halt, contingency } } : run;
}

export function bulkRunProgress(run: BulkRun): {
  settled: number;
  total: number;
} {
  const planned = run.ids.filter((id) => run.rows[id].status !== "skipped");

  return {
    settled: planned.filter((id) =>
      ["emitted", "failed"].includes(run.rows[id].status),
    ).length,
    total: planned.length,
  };
}

/**
 * The selection minus what the run emitted, for `Reintentar las que faltan`:
 * planned again from scratch, so a row skipped then may be owed now.
 */
export function unemittedBulkIds(run: BulkRun): string[] {
  return run.ids.filter((id) => run.rows[id].status !== "emitted");
}

function withRow(run: BulkRun, id: string, state: BulkRowState): BulkRun {
  return { ...run, rows: { ...run.rows, [id]: state } };
}

function findRow(run: BulkRun, status: BulkRowState["status"]): string | null {
  return run.ids.find((id) => run.rows[id].status === status) ?? null;
}

// With nothing in flight, a stopping run is over and leaves the rows it never
// reached untried; a running one is over once nothing is pending.
function settleIfIdle(run: BulkRun): BulkRun {
  if (run.phase === "done" || findRow(run, "emitting")) {
    return run;
  }

  if (run.phase === "running") {
    return findRow(run, "pending") ? run : { ...run, phase: "done" };
  }

  return {
    ...run,
    phase: "done",
    rows: Object.fromEntries(
      Object.entries(run.rows).map(([id, state]) => [
        id,
        state.status === "pending" ? { status: "untried" } : state,
      ]),
    ),
  };
}

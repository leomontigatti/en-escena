import { describe, expect, test } from "vitest";

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
  type BulkRun,
} from "./bulk-run";

const emitted = (cbteNro: number) =>
  ({
    status: "success",
    number: `0001-${String(cbteNro).padStart(8, "0")}`,
    recovered: false,
  }) as const;

function threeReady(): BulkRun {
  return startBulkRun([
    { id: "a", plan: { status: "ready", kind: "factura_c", amount: 100 } },
    { id: "skip", plan: { status: "skipped", reasons: ["Sin seña."] } },
    { id: "b", plan: { status: "ready", kind: "factura_c", amount: 200 } },
    { id: "c", plan: { status: "ready", kind: "nota_credito_c", amount: 50 } },
  ]);
}

// Drives the run the way the dialog does, answering each request in turn.
function drive(
  run: BulkRun,
  answer: (id: string) => Parameters<typeof settleBulkEmission>[2],
) {
  let current = run;

  for (let id = nextBulkEmission(current); id; id = nextBulkEmission(current)) {
    current = settleBulkEmission(
      beginBulkEmission(current, id),
      id,
      answer(id),
    );
  }

  return current;
}

describe("bulk emission run", () => {
  test("emits the planned choreographies one at a time, skipping the excluded", () => {
    let run = threeReady();
    const requested: string[] = [];

    run = drive(run, (id) => {
      requested.push(id);
      return emitted(requested.length);
    });

    expect(requested).toEqual(["a", "b", "c"]);
    expect(run.phase).toBe("done");
    expect(bulkRunProgress(run)).toEqual({ settled: 3, total: 3 });
    expect(run.rows.b).toEqual({
      status: "emitted",
      number: "0001-00000002",
      recovered: false,
    });
    expect(run.rows.skip).toEqual({
      status: "skipped",
      reasons: ["Sin seña."],
    });
  });

  test("`Detener` lets the emission in flight finish and tries no other", () => {
    let run = threeReady();
    run = beginBulkEmission(run, "a");
    run = stopBulkRun(run);

    expect(nextBulkEmission(run)).toBeNull();
    run = settleBulkEmission(run, "a", emitted(1));

    expect(run.phase).toBe("done");
    expect(run.rows.a).toMatchObject({ status: "emitted" });
    expect(run.rows.b).toEqual({ status: "untried" });
    expect(run.rows.c).toEqual({ status: "untried" });
    expect(bulkRunProgress(run)).toEqual({ settled: 1, total: 3 });
  });

  test("a series left unverified halts the run on its contingency", () => {
    const contingency = {
      status: "unverified",
      message: "Sin confirmar.",
      ptoVta: 1,
      cbteTipo: 11,
      cbteNro: 8,
    } as const;

    const run = drive(threeReady(), (id) =>
      id === "a" ? emitted(7) : { status: "warning", contingency },
    );

    expect(run.phase).toBe("done");
    expect(run.rows.b).toMatchObject({ status: "failed" });
    expect(run.rows.c).toEqual({ status: "untried" });
    expect(run.halt).toEqual({ choreographyId: "b", contingency });
    expect(isBulkRunHeld(run)).toBe(true);
    // Abandoning the attempt frees the series: what is left can be retried.
    expect(isBulkRunHeld(updateBulkHalt(run, { status: "released" }))).toBe(
      false,
    );
  });

  test("a rejection or a refusal fails its row and the run goes on", () => {
    const run = drive(threeReady(), (id) =>
      id === "a"
        ? {
            status: "warning",
            contingency: {
              status: "rejected",
              message: "ARCA rechazó el comprobante.",
              resultado: "R",
              errors: [],
              observaciones: [],
            },
          }
        : id === "b"
          ? { status: "error", message: "Lo que se debe cambió." }
          : emitted(1),
    );

    expect(run.rows.a).toEqual({
      status: "failed",
      message: "ARCA rechazó el comprobante.",
    });
    expect(run.rows.b).toEqual({
      status: "failed",
      message: "Lo que se debe cambió.",
    });
    expect(run.rows.c).toMatchObject({ status: "emitted" });
    expect(run.halt).toBeNull();
  });

  test("a request whose answer never came back stops the run there", () => {
    let run = beginBulkEmission(threeReady(), "a");
    run = settleBulkEmission(run, "a", { status: "lost" });

    expect(run.phase).toBe("done");
    expect(run.rows.a).toMatchObject({ status: "failed" });
    expect(run.rows.b).toEqual({ status: "untried" });
  });

  // The attempt that halted the run may be another unit's, so the recovery is
  // not credited to the halted row: a retry plans it again.
  test("re-checking the halting attempt into a recovery leaves its row to retry", () => {
    let run = beginBulkEmission(threeReady(), "a");
    run = settleBulkEmission(run, "a", {
      status: "warning",
      contingency: {
        status: "unverified",
        message: "Sin confirmar.",
        ptoVta: 1,
        cbteTipo: 11,
        cbteNro: 8,
      },
    });
    run = updateBulkHalt(run, { status: "recovered" });

    expect(isBulkRunHeld(run)).toBe(false);
    expect(run.rows.a).toMatchObject({ status: "failed" });
    expect(unemittedBulkIds(run)).toContain("a");
  });

  test("what is left to retry is every planned row that did not emit", () => {
    let run = beginBulkEmission(threeReady(), "a");
    run = stopBulkRun(run);
    run = settleBulkEmission(run, "a", {
      status: "error",
      message: "Ocupada.",
    });

    expect(unemittedBulkIds(run)).toEqual(["a", "skip", "b", "c"]);
  });
});

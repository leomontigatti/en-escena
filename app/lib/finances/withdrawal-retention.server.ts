/**
 * What a withdrawal does to the money (#1065, ADR-0014 §6 as corrected): the
 * withdrawn inscription retains **exactly its deposit**, the `derecho de
 * inscripción` the reglamento never returns, and everything above it goes back
 * to the academy's `Saldo disponible` in the same transaction as the
 * withdrawal. A row holding less than its deposit keeps what it has.
 *
 * From then on the row has exactly two outcomes: it keeps the whole retained
 * deposit, or the administrator releases all of it (the medical case). Never an
 * amount in between, which is why the release below takes no amount.
 *
 * What is retained is measured by `deriveRetainedAmount`, the same function the
 * credit note a withdrawal owes is measured by (`línea facturada − retenido`),
 * so the money left on the row and the document agree from the moment of the
 * withdrawal.
 */

import { deriveRetainedAmount } from "@/lib/finances/inscription-financial-status";

import {
  lockAcademyPools,
  readInscriptionAllocatedAmount,
  readTargetThresholds,
  unwindToPool,
  type PoolMovement,
} from "./allocation-pool.server";
import type { Executor } from "./choreography-cobro-support.server";

export type WithdrawnTarget = Omit<PoolMovement, "amount">;

/** Why a release on a withdrawn row had nothing to do; the caller words it. */
export type RetentionRefusal = "no-excess" | "nothing-retained";

export type RetentionResult =
  { ok: true } | { ok: false; reason: RetentionRefusal };

/**
 * Releases what a withdrawn inscription holds above the deposit it retains,
 * newest-first like `Quitar dinero`. Nothing to release is not a refusal: the
 * withdrawal paths call it on every row they withdraw.
 */
export async function releaseAboveRetainedDeposit(
  tx: Executor,
  withdrawn: WithdrawnTarget,
): Promise<void> {
  await releaseDownTo(tx, withdrawn, "deposit");
}

/**
 * `Liberar el excedente` on a withdrawn row: what it holds above its deposit,
 * for a row withdrawn before the release at withdrawal existed, or whose
 * deposit moved down since (a row below its deposit is not price-locked, so its
 * effective price can). Refused when there is none, like the active row's.
 */
export async function releaseWithdrawnExcess(
  tx: Executor,
  withdrawn: WithdrawnTarget,
): Promise<RetentionResult> {
  return (await releaseDownTo(tx, withdrawn, "deposit")) > 0
    ? { ok: true }
    : { ok: false, reason: "no-excess" };
}

/**
 * The medical case: the whole retained deposit goes back to `Saldo
 * disponible`, and the row retains nothing. All of it or nothing, so there is
 * no amount.
 */
export async function releaseRetainedDeposit(
  tx: Executor,
  withdrawn: WithdrawnTarget,
): Promise<RetentionResult> {
  return (await releaseDownTo(tx, withdrawn, "nothing")) > 0
    ? { ok: true }
    : { ok: false, reason: "nothing-retained" };
}

/**
 * Unwinds the row down to what it keeps, its retained deposit or nothing, and
 * answers how much it released. The pool's lock comes first, and `unwindToPool`
 * re-enters it: the figure is read under the lock every other movement of this
 * money takes, so the unwind cannot fall short; if it ever does, the
 * transaction must not commit as if the money had moved.
 */
async function releaseDownTo(
  tx: Executor,
  withdrawn: WithdrawnTarget,
  keep: "deposit" | "nothing",
): Promise<number> {
  await lockAcademyPools(tx, [withdrawn]);
  const allocatedAmount = await readInscriptionAllocatedAmount(
    tx,
    withdrawn.target,
  );
  const keptAmount =
    keep === "nothing"
      ? 0
      : deriveRetainedAmount({
          allocatedAmount,
          depositAmount:
            (await readTargetThresholds(tx, withdrawn))?.depositAmount ?? null,
        });
  const releasedAmount = allocatedAmount - keptAmount;

  if (releasedAmount > 0) {
    const unwound = await unwindToPool(tx, {
      ...withdrawn,
      amount: releasedAmount,
    });

    if (!unwound.ok) {
      throw new Error(unwound.message);
    }
  }

  return releasedAmount;
}

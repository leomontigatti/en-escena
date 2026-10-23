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
import type {
  CobroResult,
  Executor,
} from "./choreography-cobro-support.server";

export type WithdrawnTarget = Omit<PoolMovement, "amount">;

/**
 * `Quitar dinero` with an amount, on a withdrawn row: an amount in between the
 * two outcomes is what the clause forbids, so the writers refuse it by name.
 */
export const partialRetainedReleaseMessage =
  "De una inscripción retirada se libera toda la seña retenida o nada.";

/**
 * Releases what a withdrawn inscription holds above the deposit it retains,
 * newest-first like `Quitar dinero`. Nothing to release is not a refusal: the
 * withdrawal paths call it on every row they withdraw.
 */
export async function releaseAboveRetainedDeposit(
  tx: Executor,
  withdrawn: WithdrawnTarget,
): Promise<CobroResult> {
  // The pool's lock first, which `unwindToPool` re-enters: the figure is read
  // under the lock every other movement of this money takes.
  await lockAcademyPools(tx, [withdrawn]);
  const excess = await readExcessAboveRetained(tx, withdrawn);

  return excess > 0
    ? await unwindToPool(tx, { ...withdrawn, amount: excess })
    : { ok: true };
}

/**
 * `Liberar el excedente` on a withdrawn row: what it holds above its deposit, for
 * a row withdrawn before the release at withdrawal existed, or whose deposit moved
 * down since. Refused when there is none, like the active row's excess.
 */
export async function releaseWithdrawnExcess(
  tx: Executor,
  withdrawn: WithdrawnTarget,
): Promise<CobroResult> {
  await lockAcademyPools(tx, [withdrawn]);
  const excess = await readExcessAboveRetained(tx, withdrawn);

  return excess > 0
    ? await unwindToPool(tx, { ...withdrawn, amount: excess })
    : {
        ok: false,
        message: "Esta inscripción no tiene excedente para liberar.",
      };
}

/**
 * What a withdrawn inscription holds above what it retains: zero once the
 * withdrawal has released it, and more only when its deposit moved down afterwards
 * (a row below its deposit is not price-locked, so its effective price can).
 */
async function readExcessAboveRetained(
  tx: Executor,
  withdrawn: WithdrawnTarget,
): Promise<number> {
  const [thresholds, allocatedAmount] = await Promise.all([
    readTargetThresholds(tx, withdrawn),
    readInscriptionAllocatedAmount(tx, withdrawn.target),
  ]);

  return (
    allocatedAmount -
    deriveRetainedAmount({
      allocatedAmount,
      depositAmount: thresholds?.depositAmount ?? null,
    })
  );
}

/**
 * The medical case: the whole retained deposit goes back to `Saldo disponible`,
 * and the row retains nothing. All of it or nothing, so there is no amount.
 */
export async function releaseRetainedDeposit(
  tx: Executor,
  withdrawn: WithdrawnTarget,
): Promise<CobroResult> {
  await lockAcademyPools(tx, [withdrawn]);
  const allocatedAmount = await readInscriptionAllocatedAmount(
    tx,
    withdrawn.target,
  );

  if (allocatedAmount === 0) {
    return { ok: false, message: "Esta inscripción no retiene dinero." };
  }

  return await unwindToPool(tx, { ...withdrawn, amount: allocatedAmount });
}

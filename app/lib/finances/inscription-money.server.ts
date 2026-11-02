/**
 * The money gestures on one inscription, of either kind: taking an arbitrary
 * amount off it, releasing exactly what it holds above its `Total`, and the two
 * outcomes of a withdrawn row's retained deposit
 * (`withdrawal-retention.server.ts`).
 *
 * This module owns the script of each gesture. What really differs by kind sits
 * behind `InscriptionMoneyKind`, chosen here from `target.kind` the way the pool
 * picks its threshold reader, so a rule added here reaches both kinds.
 *
 * All of them go through the pool rules and **none lets the administrator name a
 * payment**: `unwindToPool` gives the money back newest-first, and which payment
 * a peso came from is the system's answer, not a person's. A removal has nothing
 * to refuse on financial grounds, and it carries no price: the figures and the
 * status re-derive from what is left, and taking money off until the row falls
 * back below its deposit is precisely what opens the price lock again.
 *
 * A scope names no choreography or seminar: which screen may touch a row is the
 * caller's check (`readInscriptionChoreographyId`,
 * `readSeminarInscriptionMoneyTarget`), and a row's parent never changes.
 */

import { deriveInscriptionFinancialFigures } from "@/lib/finances/inscription-financial-status";

import type {
  AllocationTarget,
  AllocationTargetKind,
} from "./allocation-target.server";
import {
  readInscriptionAllocatedAmount,
  readTargetThresholds,
  unwindToPool,
} from "./allocation-pool.server";
import {
  runCobro,
  type CobroResult,
  type Transaction,
} from "./choreography-cobro-support.server";
import { choreographyMoney } from "./inscription-money-choreography.server";
import { inscriptionMoneyRefusals } from "./inscription-money-refusals";
import { seminarMoney } from "./inscription-money-seminar.server";
import { toCobroResult } from "./withdrawal-retention-refusals";
import { releaseRetainedDeposit } from "./withdrawal-retention.server";

export type MoneyResult = CobroResult;

export type InscriptionMoneyScope = {
  academyId: string;
  eventId: string;
  target: AllocationTarget;
};

/** A row the scope reaches, as a gesture reads it under the kind's locks. */
export type MoneyContext =
  { ok: false; message: string } | { ok: true; withdrawn: boolean };

/** What a gesture needs from a kind of inscription. */
export type InscriptionMoneyKind = {
  /** Takes the kind's locks in its documented order, then checks the row
   * belongs to the scope. */
  loadContext(
    tx: Transaction,
    scope: InscriptionMoneyScope,
  ): Promise<MoneyContext>;
};

const moneyKinds: Record<AllocationTargetKind, InscriptionMoneyKind> = {
  choreography: choreographyMoney,
  seminar: seminarMoney,
};

function loadContext(tx: Transaction, scope: InscriptionMoneyScope) {
  return moneyKinds[scope.target.kind].loadContext(tx, scope);
}

/** Takes an arbitrary amount off the inscription, back to `Saldo disponible`. */
export async function removeFromInscription(
  input: InscriptionMoneyScope & { amount: number },
): Promise<MoneyResult> {
  return await runCobro(async (tx) => {
    const context = await loadContext(tx, input);
    if (!context.ok) {
      return context;
    }

    if (context.withdrawn) {
      return {
        ok: false,
        message: inscriptionMoneyRefusals.partialRetainedRelease,
      };
    }

    return await unwindToPool(tx, input);
  });
}

/**
 * Releases **exactly** what the inscription holds above its `Total` and nothing
 * more. There is nothing to type and nothing to pick: the excess is computed,
 * which is what makes this one click rather than a dialog.
 */
export async function releaseInscriptionExcess(
  scope: InscriptionMoneyScope,
): Promise<MoneyResult> {
  return await runCobro(async (tx) => {
    const context = await loadContext(tx, scope);
    if (!context.ok) {
      return context;
    }

    if (context.withdrawn) {
      return {
        ok: false,
        message: inscriptionMoneyRefusals.partialRetainedRelease,
      };
    }

    const thresholds = await readTargetThresholds(tx, scope);

    if (!thresholds) {
      return {
        ok: false,
        message: inscriptionMoneyRefusals.inscriptionNotFound,
      };
    }

    const figures = deriveInscriptionFinancialFigures({
      allocatedAmount: await readInscriptionAllocatedAmount(tx, scope.target),
      thresholds,
    });

    if (!figures.overAllocatedAmount) {
      return { ok: false, message: inscriptionMoneyRefusals.noExcess };
    }

    return await unwindToPool(tx, {
      ...scope,
      amount: figures.overAllocatedAmount,
    });
  });
}

/**
 * The medical case on a withdrawn inscription: its whole retained deposit goes
 * back to `Saldo disponible`. There is no amount, because the clause allows no
 * outcome between keeping all of it and releasing all of it.
 */
export async function releaseRetainedInscriptionDeposit(
  scope: InscriptionMoneyScope,
): Promise<MoneyResult> {
  return await runCobro(async (tx) => {
    const context = await loadContext(tx, scope);
    if (!context.ok) {
      return context;
    }

    if (!context.withdrawn) {
      return { ok: false, message: inscriptionMoneyRefusals.notWithdrawn };
    }

    return toCobroResult(await releaseRetainedDeposit(tx, scope));
  });
}

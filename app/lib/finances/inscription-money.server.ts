/**
 * The money gestures on one inscription, of either kind: putting an arbitrary
 * amount on it, taking one off, releasing exactly what it holds above its
 * `Total`, and the two outcomes of a withdrawn row's retained deposit
 * (`withdrawal-retention.server.ts`).
 *
 * This module owns the script of each gesture. What really differs by kind sits
 * behind `InscriptionMoneyKind`, chosen here from `target.kind` the way the pool
 * picks its threshold reader, so a rule added here reaches both kinds.
 *
 * All of them go through the pool rules and **none lets the administrator name a
 * payment**: `spreadFromPool` consumes the academy's payments oldest-first,
 * `unwindToPool` gives the money back newest-first, and which payment a peso came
 * from is the system's answer, not a person's. A removal has nothing to refuse on
 * financial grounds, and it carries no price: the figures and the status re-derive
 * from what is left, and taking money off until the row falls back below its
 * deposit is precisely what opens the price lock again.
 *
 * **Adding money is the only direction that refuses, and the only one with a
 * price.** Active over-allocation is rejected by `spreadFromPool` with no
 * override. The price fixes the two thresholds, so it belongs to the moment money
 * lands, and it is locked once the inscription covers its deposit: a rule the
 * database also holds, through the guard triggers on `selected_price_id`.
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
  spreadFromPool,
  unwindToPool,
  type PoolTargetGuard,
} from "./allocation-pool.server";
import {
  runCobro,
  type CobroResult,
  type Executor,
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

type MoneyRefusal = { ok: false; message: string };

/** A row the scope reaches, as a gesture reads it under the kind's locks. */
export type MoneyContext = MoneyRefusal | { ok: true; withdrawn: boolean };

/** What the pricing step reads of a row, whatever else its kind adds. */
export type PricingContext = {
  eventId: string;
  id: string;
  ok: true;
  selectedPriceId: string | null;
};

/** The row to store when nobody named one, or `null` to store none. */
export type PickOutcome = MoneyRefusal | { ok: true; priceId: string | null };

/**
 * What a gesture needs from a kind of inscription. A kind's methods take the
 * context its own `loadPricingContext` answered: `moneyKinds` hands a script one
 * kind, so a context never reaches another's methods.
 */
export type InscriptionMoneyKind<
  Context extends PricingContext = PricingContext,
> = {
  /** Takes the kind's locks in its documented order, then checks the row
   * belongs to the scope. */
  loadContext(
    tx: Transaction,
    scope: InscriptionMoneyScope,
  ): Promise<MoneyContext>;
  /** `loadContext`, plus the locks a gesture that prices owes on top, and what
   * pricing the row reads. */
  loadPricingContext(
    tx: Transaction,
    scope: InscriptionMoneyScope,
  ): Promise<MoneyRefusal | Context>;
  /**
   * Whether the row has crossed the deposit of the price it **stores**, as the
   * database has it now. The stored row and never the effective one: below the
   * threshold the effective row is today's, and asking whether today's row was
   * crossed is the circularity the price lock exists to avoid. With no stored
   * row there is no threshold, so nothing is locked.
   */
  hasCrossedStored(
    executor: Executor,
    context: Context,
    allocatedAmount: number,
  ): Promise<boolean>;
  /** The row a named price resolves to, or `null` when it is no candidate. */
  candidate(
    tx: Transaction,
    context: Context,
    priceId: string,
  ): Promise<{ id: string } | null>;
  /** No pick on a row that has one or holds money: keep the stored row, store
   * the row in effect, or refuse. */
  withoutPick(tx: Transaction, context: Context): Promise<PickOutcome>;
  storePrice(
    tx: Transaction,
    inscriptionId: string,
    priceRowId: string,
  ): Promise<void>;
  /**
   * What the crossing owes the pool's `targetGuard`; absent on a kind that owes
   * nothing. Called **before the pricing step**, because a cheaper row can
   * itself be the crossing: the guard needs the state from before it.
   */
  crossingGuard?(
    tx: Transaction,
    context: Context,
    now: Date,
  ): Promise<PoolTargetGuard>;
};

const moneyKinds: Record<AllocationTargetKind, InscriptionMoneyKind> = {
  choreography: choreographyMoney,
  seminar: seminarMoney,
};

function loadContext(tx: Transaction, scope: InscriptionMoneyScope) {
  return moneyKinds[scope.target.kind].loadContext(tx, scope);
}

/**
 * Puts an arbitrary amount on one inscription, out of the academy's
 * `Saldo disponible`.
 *
 * `priceId` is the price chosen inside the dialog, and it is only honoured while
 * the inscription has not covered its deposit: from that crossing on, a different
 * row is refused rather than warned about. Any amount is allocatable: a partial
 * one leaves the row reading `Seña pendiente` with its shortfall, which is an
 * ordinary outcome and not an error.
 */
export async function allocateToInscription(
  input: InscriptionMoneyScope & {
    amount: number;
    /** The instant a crossing's guard judges at; a kind with none ignores it. */
    now: Date;
    priceId: string | null;
  },
): Promise<MoneyResult> {
  return await runCobro(async (tx) => {
    const kind = moneyKinds[input.target.kind];
    const context = await kind.loadPricingContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const targetGuard = await kind.crossingGuard?.(tx, context, input.now);
    const priced = await applySelectedPrice(tx, kind, context, {
      allocatedAmount: await readInscriptionAllocatedAmount(tx, input.target),
      priceId: input.priceId,
    });
    if (!priced.ok) {
      return priced;
    }

    return await spreadFromPool(tx, {
      academyId: input.academyId,
      amount: input.amount,
      eventId: input.eventId,
      target: input.target,
      targetGuard,
    });
  });
}

/**
 * The price the money lands against. While the inscription is **below the
 * deposit of the row it stores** the chosen row is written, whatever it already
 * holds; from the crossing on the price is **locked**, and a different row is
 * refused with the way out named: take enough money off to drop back below the
 * deposit.
 */
async function applySelectedPrice(
  tx: Transaction,
  kind: InscriptionMoneyKind,
  context: PricingContext,
  input: { allocatedAmount: number; priceId: string | null },
): Promise<MoneyResult> {
  if (await kind.hasCrossedStored(tx, context, input.allocatedAmount)) {
    return input.priceId !== null && input.priceId !== context.selectedPriceId
      ? { ok: false, message: inscriptionMoneyRefusals.priceFixed }
      : { ok: true };
  }

  const picked = await resolvePickedPriceId(tx, kind, context, input);

  if (!picked.ok) {
    return picked;
  }

  if (picked.priceId === null) {
    return { ok: true };
  }

  const price = await kind.candidate(tx, context, picked.priceId);

  if (!price) {
    return { ok: false, message: inscriptionMoneyRefusals.unknownPriceRow };
  }

  await kind.storePrice(tx, context.id, price.id);

  return { ok: true };
}

/**
 * The row to store, or `null` for none. The one row that has to be told to pick
 * one is the row that holds nothing and stores nothing: there, neither the
 * administrator nor a previous charge has said anything yet.
 *
 * `allocatedAmount === 0` **preserves the previous behaviour** rather than adding
 * a rule. Until now `allocatedAmount > 0` short-circuited the crossing check, so
 * this was only ever reached with an empty row; without the added test, an
 * inscription holding money and storing no price (a state the presets can
 * produce) would start failing with "Elegí un precio".
 */
async function resolvePickedPriceId(
  tx: Transaction,
  kind: InscriptionMoneyKind,
  context: PricingContext,
  input: { allocatedAmount: number; priceId: string | null },
): Promise<PickOutcome> {
  if (input.priceId !== null) {
    return { ok: true, priceId: input.priceId };
  }

  if (context.selectedPriceId === null && input.allocatedAmount === 0) {
    return { ok: false, message: inscriptionMoneyRefusals.pickPrice };
  }

  return await kind.withoutPick(tx, context);
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

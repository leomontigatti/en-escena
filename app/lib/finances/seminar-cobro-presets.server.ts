/**
 * `Pagar seña` and `Pagar saldo` over the `(seminar, academy)` rows selected on
 * an academy's `Seminarios` tab: every active seminar inscription the academy
 * holds in each selected seminar is charged what it owes for the stage, out of
 * the academy's pool, in one all-or-nothing write.
 *
 * The seminar twin of `choreography-cobro-presets.server.ts`, with two
 * differences the seminar side forces:
 *
 * - **There is no price picker.** An inscription that holds no price is stored
 *   the row that applies to the person today; one that holds a price keeps it.
 * - **Covering the deposit takes a place.** Every selected seminar is locked
 *   before anything is read, and the charge is refused whole when any of them
 *   is short of the places its crossings need.
 *
 * What the charge would do is read by `readSeminarCobroPlan`, which the write
 * runs under its locks and a preview may run outside them, so the two cannot
 * disagree on who is charged, at which price, or how many places it takes.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  dancers,
  professors,
  seminarInscriptions,
  seminarPrices,
} from "@/db/schema";
import { hasCrossedDepositThreshold } from "@/lib/finances/inscription-financial-status";
import { deriveSeminarInscriptionThresholds } from "@/lib/finances/seminar-inscription-price";
import {
  resolveSeminarInscriptions,
  type ResolvedSeminarInscription,
  type SeminarFinancePriceRow,
} from "@/lib/finances/seminar-inscription-thresholds.server";

import { spreadFromPool } from "./allocation-pool.server";
import type { CobroStage } from "./choreography-cobro-presets.server";
import {
  runCobro,
  type CobroResult,
  type Executor,
} from "./choreography-cobro-support.server";
import {
  applyCurrentSeminarPrices,
  assertSeminarPlacesForCrossings,
  lockSeminars,
  type LockedSeminar,
} from "./seminar-money-support.server";

const seminarNotFoundMessage = "No encontramos ese seminario.";

type ActiveSeminarInscription = {
  dancerId: string | null;
  id: string;
  professorId: string | null;
  selectedPriceId: string | null;
  seminarId: string;
};

/**
 * One inscription the charge reaches: it owes something for the stage. `priceRow`
 * is the row it is charged at — the one it holds once its deposit is covered,
 * and otherwise the one that applies to the person today, which is what the
 * write stores on an inscription that holds none. `owedAmount` is `null` only
 * when no row prices it at all, which refuses the charge.
 */
type SeminarCobroLine = ActiveSeminarInscription & {
  crossesDeposit: boolean;
  owedAmount: number | null;
  priceRow: SeminarFinancePriceRow | null;
};

type SeminarCobroPlan = {
  /** How many active inscriptions the academy holds across the seminars,
   * reached by the charge or not. */
  activeCount: number;
  lines: SeminarCobroLine[];
  /** Per seminar, how many of the lines carry an inscription across its
   * deposit: the places the charge would take. */
  neededBySeminarId: Map<string, number>;
};

type PlanSeminar = Pick<
  LockedSeminar,
  "id" | "kind" | "requiredDepositPercentage"
>;

/**
 * What a preset over the given seminars would charge: the academy's **active**
 * inscriptions in them (withdrawn ones are never read), each one's price and
 * owed figure for the stage, and the places the crossings would take.
 *
 * Inscriptions that owe nothing for the stage are left out, so running the same
 * preset twice reaches nobody the second time. The write runs it under the
 * seminars' locks; a preview of the charge reads the same plan without them.
 */
async function readSeminarCobroPlan(
  executor: Executor,
  input: {
    academyId: string;
    eventId: string;
    seminars: readonly PlanSeminar[];
    stage: CobroStage;
  },
): Promise<SeminarCobroPlan> {
  const seminarsById = new Map(
    input.seminars.map((seminar) => [seminar.id, seminar]),
  );
  const rows = await readActiveSeminarInscriptions(executor, {
    academyId: input.academyId,
    seminarIds: [...seminarsById.keys()],
  });
  const [resolutions, priceRows] = await Promise.all([
    resolveSeminarInscriptions(executor, {
      eventId: input.eventId,
      rows: rows.map((row) => {
        const seminar = seminarsById.get(row.seminarId)!;

        return {
          ...row,
          requiredDepositPercentage: seminar.requiredDepositPercentage,
          seminarKind: seminar.kind,
          withdrawnAt: null,
        };
      }),
    }),
    executor.query.seminarPrices.findMany({
      columns: { amount: true, id: true },
      where: eq(seminarPrices.eventId, input.eventId),
    }),
  ]);
  const priceAmountById = new Map(
    priceRows.map((price) => [price.id, price.amount]),
  );
  const lines = rows.flatMap((row) => {
    const resolution = resolutions.get(row.id);
    const line = resolution
      ? planLine({
          priceAmountById,
          requiredDepositPercentage: seminarsById.get(row.seminarId)!
            .requiredDepositPercentage,
          resolution,
          row,
          stage: input.stage,
        })
      : null;

    return line ? [line] : [];
  });

  return {
    activeCount: rows.length,
    lines,
    neededBySeminarId: countCrossingsBySeminar(lines),
  };
}

/**
 * The academy's active inscriptions in the seminars, read through the person
 * as everywhere on this side.
 */
async function readActiveSeminarInscriptions(
  executor: Executor,
  input: { academyId: string; seminarIds: string[] },
): Promise<ActiveSeminarInscription[]> {
  if (input.seminarIds.length === 0) {
    return [];
  }

  return await executor
    .select({
      dancerId: seminarInscriptions.dancerId,
      id: seminarInscriptions.id,
      professorId: seminarInscriptions.professorId,
      seminarId: seminarInscriptions.seminarId,
      selectedPriceId: seminarInscriptions.selectedPriceId,
    })
    .from(seminarInscriptions)
    .leftJoin(dancers, eq(dancers.id, seminarInscriptions.dancerId))
    .leftJoin(professors, eq(professors.id, seminarInscriptions.professorId))
    .where(
      and(
        inArray(seminarInscriptions.seminarId, input.seminarIds),
        isNull(seminarInscriptions.withdrawnAt),
        eq(
          sql`coalesce(${dancers.academyId}, ${professors.academyId})`,
          input.academyId,
        ),
      ),
    )
    .orderBy(seminarInscriptions.seminarId, seminarInscriptions.id);
}

/**
 * One inscription's part in the charge, or `null` when it owes nothing for the
 * stage.
 *
 * Covered is judged by the deposit of the row the inscription **stores**, so
 * after the write that is the row it holds or, when it holds none, the one the
 * write is about to store — today's, its effective row.
 */
function planLine(input: {
  priceAmountById: ReadonlyMap<string, number>;
  requiredDepositPercentage: number;
  resolution: ResolvedSeminarInscription;
  row: ActiveSeminarInscription;
  stage: CobroStage;
}): SeminarCobroLine | null {
  const { resolution, row } = input;
  const owedAmount =
    input.stage === "deposit"
      ? resolution.owedDepositAmount
      : resolution.owedBalanceAmount;

  if (owedAmount === 0) {
    return null;
  }

  const storedPriceAmount =
    row.selectedPriceId === null
      ? (resolution.priceRow?.amount ?? null)
      : (input.priceAmountById.get(row.selectedPriceId) ?? null);
  const crossesDeposit =
    owedAmount !== null &&
    !resolution.covered &&
    hasCrossedDepositThreshold({
      allocatedAmount: resolution.allocatedAmount + owedAmount,
      depositAmount: deriveSeminarInscriptionThresholds({
        priceAmount: storedPriceAmount,
        requiredDepositPercentage: input.requiredDepositPercentage,
      }).depositAmount,
    });

  return {
    ...row,
    crossesDeposit,
    owedAmount,
    priceRow: resolution.priceRow,
  };
}

function countCrossingsBySeminar(
  lines: readonly SeminarCobroLine[],
): Map<string, number> {
  const needed = new Map<string, number>();

  for (const line of lines) {
    if (line.crossesDeposit) {
      needed.set(line.seminarId, (needed.get(line.seminarId) ?? 0) + 1);
    }
  }

  return needed;
}

/**
 * Charges the stage over the selected seminars. The client names the seminars
 * and nothing else: who is charged, at which price and how much is recomputed
 * here, under the seminars' locks.
 *
 * The refusals, in the order they are checked: a seminar that is not the
 * event's, a selection with no active inscription, a seminar short of places,
 * an inscription nothing prices, and a pool that cannot cover the charge. Any
 * of them rolls the whole charge back.
 */
export async function paySeminarsPreset(input: {
  academyId: string;
  eventId: string;
  seminarIds: string[];
  stage: CobroStage;
}): Promise<CobroResult> {
  const seminarIds = [...new Set(input.seminarIds)];

  if (seminarIds.length === 0) {
    return { ok: false, message: "Elegí al menos un seminario." };
  }

  return await runCobro(async (tx) => {
    const locked = await lockSeminars(tx, seminarIds);

    if (
      locked.length !== seminarIds.length ||
      locked.some((seminar) => seminar.eventId !== input.eventId)
    ) {
      return { ok: false, message: seminarNotFoundMessage };
    }

    const plan = await readSeminarCobroPlan(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      seminars: locked,
      stage: input.stage,
    });

    if (plan.activeCount === 0) {
      return {
        ok: false,
        message: "Los seminarios elegidos no tienen inscripciones activas.",
      };
    }

    const places = await assertSeminarPlacesForCrossings(tx, {
      neededBySeminarId: plan.neededBySeminarId,
      seminars: locked,
    });

    if (!places.ok) {
      return places;
    }

    const priced = await applyCurrentSeminarPrices(tx, {
      eventId: input.eventId,
      inscriptions: plan.lines,
      seminars: locked,
    });

    if (!priced.ok) {
      return priced;
    }

    return await fundPlanLines(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      lines: plan.lines,
    });
  });
}

/** Spreads each line's owed figure from the pool, oldest payment first. */
async function fundPlanLines(
  tx: Executor,
  input: {
    academyId: string;
    eventId: string;
    lines: readonly SeminarCobroLine[];
  },
): Promise<CobroResult> {
  for (const line of input.lines) {
    if (line.owedAmount === null) {
      return {
        ok: false,
        message:
          "No hay un precio de seminario configurado para alguna de las inscripciones.",
      };
    }

    const funded = await spreadFromPool(tx, {
      academyId: input.academyId,
      amount: line.owedAmount,
      eventId: input.eventId,
      target: { id: line.id, kind: "seminar" },
    });

    if (!funded.ok) {
      return funded;
    }
  }

  return { ok: true };
}

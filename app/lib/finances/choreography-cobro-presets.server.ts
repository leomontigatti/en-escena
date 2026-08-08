/**
 * `Pagar seña` and `Pagar saldo` as **list actions** over several selected
 * choreographies at once.
 *
 * A preset is nothing but a pre-filled figure. It reads each active
 * inscription's shortfall against the requested threshold and funds exactly
 * that from the academy's `Saldo disponible`, through the very same
 * `spreadFromPool` a hand-typed amount goes through. What lands in
 * `payment_allocation` is a plain `(payment, inscription, amount)` row: nothing
 * in the data says a preset wrote it, and nothing downstream may branch on it.
 *
 * The chosen price is applied **only to inscriptions with no money on them
 * yet**, because the price is fixed by the first allocation. A preset never
 * moves the price out from under money that is already allocated.
 *
 * The whole run is one transaction: a pool that dries up on the last
 * choreography rolls the first one back, so an administrator who sees a refusal
 * can trust that nothing moved.
 */

import { and, eq, inArray } from "drizzle-orm";

import {
  choreographies,
  choreographyDancers,
  scheduleCapacities,
} from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { resolveChoreographyPricingScheduleId } from "@/lib/finances/choreography-pricing-schedule";
import { deriveInscriptionFinancialFigures } from "@/lib/finances/inscription-financial-status";
import { readInscriptionThresholds } from "@/lib/finances/inscription-thresholds.server";

import {
  readInscriptionAllocatedAmount,
  spreadFromPool,
} from "./allocation-pool.server";
import {
  loadCandidatePriceRow,
  runCobro,
  type CobroResult,
  type Transaction,
} from "./choreography-cobro-support.server";

/**
 * The threshold a cobro preset settles against: `deposit` allocates up to the
 * `Seña`, `balance` up to the `Total`.
 */
export type CobroStage = "deposit" | "balance";

/**
 * The price the administrator picked, keyed by group type. One entry per group
 * type present in the selection: the picker filters to the choreography's group
 * type, so a selection spanning two group types asks twice. A missing entry is
 * not an error — the inscription keeps whatever price already resolves for it.
 */
export type PresetPriceSelection = Record<string, string>;

type PresetChoreography = {
  groupType: string;
  id: string;
  scheduleId: string | null;
};

export async function payChoreographiesPreset(input: {
  academyId: string;
  choreographyIds: string[];
  eventId: string;
  priceIdByGroupType: PresetPriceSelection;
  stage: CobroStage;
}): Promise<CobroResult> {
  const choreographyIds = [...new Set(input.choreographyIds)];

  if (choreographyIds.length === 0) {
    return { ok: false, message: "Elegí al menos una coreografía." };
  }

  return await runCobro(async (tx) => {
    const selected = await readSelectedChoreographies(tx, {
      academyId: input.academyId,
      choreographyIds,
      eventId: input.eventId,
    });

    if (selected.length !== choreographyIds.length) {
      return { ok: false, message: choreographyNotFoundMessage };
    }

    const inscriptions = await tx
      .select({
        choreographyId: choreographyDancers.choreographyId,
        id: choreographyDancers.id,
      })
      .from(choreographyDancers)
      .where(
        and(
          inArray(choreographyDancers.choreographyId, choreographyIds),
          activeInscription(),
        ),
      );

    if (inscriptions.length === 0) {
      return {
        ok: false,
        message: "Las coreografías elegidas no tienen inscripciones activas.",
      };
    }

    const priced = await applySelectedPrices(tx, {
      choreographies: selected,
      eventId: input.eventId,
      inscriptions,
      priceIdByGroupType: input.priceIdByGroupType,
    });

    if (!priced.ok) {
      return priced;
    }

    return await fundOwedThreshold(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptionIds: inscriptions.map((inscription) => inscription.id),
      stage: input.stage,
    });
  });
}

/**
 * The heart of the cobro presets: allocates each inscription **exactly what it
 * owes** against the requested stage, out of the academy's pool. Owed is
 * computed here, on the write path, through the same owner the read path uses,
 * so a preset cannot over-allocate. An inscription that already covered the
 * threshold is skipped rather than failing: the preset is idempotent.
 */
async function fundOwedThreshold(
  tx: Transaction,
  input: {
    academyId: string;
    eventId: string;
    inscriptionIds: string[];
    stage: CobroStage;
  },
): Promise<CobroResult> {
  const thresholds = await readInscriptionThresholds(tx, {
    academyId: input.academyId,
    eventId: input.eventId,
    inscriptionIds: input.inscriptionIds,
  });

  for (const inscriptionId of input.inscriptionIds) {
    const resolution = thresholds.get(inscriptionId);

    if (!resolution) {
      return { ok: false, message: "No encontramos esa inscripción." };
    }

    const figures = deriveInscriptionFinancialFigures({
      allocatedAmount: await readInscriptionAllocatedAmount(tx, inscriptionId),
      thresholds: resolution,
    });
    const owedAmount =
      input.stage === "deposit"
        ? figures.owedDepositAmount
        : figures.owedBalanceAmount;

    if (owedAmount === null) {
      return {
        ok: false,
        message:
          "No hay un precio configurado para este tipo de grupo y cronograma.",
      };
    }

    if (owedAmount === 0) {
      continue;
    }

    const result = await spreadFromPool(tx, {
      academyId: input.academyId,
      amount: owedAmount,
      eventId: input.eventId,
      inscriptionId,
    });

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

/**
 * The selected choreographies, scoped to the academy and event of the list the
 * action was fired from. A row missing here is a row that does not belong to
 * this list, which is why the caller compares counts instead of trusting ids
 * that arrived in a form.
 */
async function readSelectedChoreographies(
  tx: Transaction,
  input: { academyId: string; choreographyIds: string[]; eventId: string },
): Promise<PresetChoreography[]> {
  const rows = await tx
    .select({
      choreographyScheduleId: choreographies.scheduleId,
      groupType: choreographies.groupType,
      id: choreographies.id,
      scheduleCapacityScheduleId: scheduleCapacities.scheduleId,
    })
    .from(choreographies)
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .where(
      and(
        eq(choreographies.academyId, input.academyId),
        eq(choreographies.eventId, input.eventId),
        inArray(choreographies.id, input.choreographyIds),
      ),
    );

  return rows.map((row) => ({
    groupType: row.groupType,
    id: row.id,
    scheduleId: resolveChoreographyPricingScheduleId(row),
  }));
}

/**
 * Fixes the picked price on the inscriptions that can still take one. An
 * inscription that already holds money keeps its price: that is the lock the
 * first allocation puts on it, enforced here rather than only in the dialog.
 *
 * A price that does not belong to the choreography's candidate set — wrong
 * group type, or a row tied to another schedule — refuses the whole preset. The
 * alternative, silently ignoring it, would allocate against a figure the
 * administrator never saw.
 */
async function applySelectedPrices(
  tx: Transaction,
  input: {
    choreographies: PresetChoreography[];
    eventId: string;
    inscriptions: Array<{ choreographyId: string; id: string }>;
    priceIdByGroupType: PresetPriceSelection;
  },
): Promise<CobroResult> {
  const byId = new Map(
    input.choreographies.map((choreography) => [choreography.id, choreography]),
  );

  for (const inscription of input.inscriptions) {
    const choreography = byId.get(inscription.choreographyId);
    const priceId = choreography
      ? input.priceIdByGroupType[choreography.groupType]
      : undefined;

    if (!choreography || !priceId) {
      continue;
    }

    if ((await readInscriptionAllocatedAmount(tx, inscription.id)) > 0) {
      continue;
    }

    const price = await loadCandidatePriceRow(tx, {
      eventId: input.eventId,
      groupType: choreography.groupType,
      priceId,
      scheduleId: choreography.scheduleId,
    });

    if (!price) {
      return {
        ok: false,
        message: "Esa fila de precio no corresponde a la coreografía elegida.",
      };
    }

    await tx
      .update(choreographyDancers)
      .set({ selectedPriceId: price.id })
      .where(eq(choreographyDancers.id, inscription.id));
  }

  return { ok: true };
}

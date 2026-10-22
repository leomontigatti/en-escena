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
 *   the row that applies to the person today; one that holds a price of the
 *   person's current participant cell keeps it, and is charged by it. Below the
 *   deposit, a held price of the other cell is replaced by today's row
 *   (`chargedPriceRow`).
 * - **Covering the deposit takes a place.** Every selected seminar is locked
 *   before anything is read, and the charge is refused whole when any of them
 *   is short of the places its crossings need.
 *
 * What the charge would do is read in two steps: `readSeminarCobroInscriptions`
 * loads the academy's inscriptions with their money, and `planSeminarCobro`
 * derives one stage's charge from them. The write runs both under its locks and
 * a preview runs them outside, so the two cannot disagree on who is charged, at
 * which price, or how many places it takes.
 */

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { seminarInscriptions, seminars } from "@/db/schema";
import { formatDancerName } from "@/lib/finances/formatters";
import {
  deriveInscriptionFinancialFigures,
  hasCrossedDepositThreshold,
} from "@/lib/finances/inscription-financial-status";
import { seminarOverAllocatedMessage } from "@/lib/finances/seminar-cobro-refusals";
import { deriveSeminarInscriptionThresholds } from "@/lib/finances/seminar-inscription-price";
import {
  resolveSeminarInscriptions,
  type ResolvedSeminarInscription,
  type SeminarFinancePriceRow,
} from "@/lib/finances/seminar-inscription-thresholds.server";
import { activeSeminarInscription } from "@/lib/seminars/active-inscription";
import {
  countReservedByOthers,
  readSeminarPlaces,
  type SeminarPlaces,
} from "@/lib/seminars/covered-inscriptions.server";
import {
  seminarInscriptionOwnedBy,
  seminarInscriptionPerson,
} from "@/lib/seminars/inscription-person.server";

import { spreadFromPool } from "./allocation-pool.server";
import type { CobroStage } from "./choreography-cobro-presets.server";
import {
  runCobro,
  type CobroResult,
  type Executor,
} from "./choreography-cobro-support.server";
import {
  assertSeminarPlacesForCrossings,
  lockSeminars,
  type LockedSeminar,
} from "./seminar-money-support.server";
import type { SeminarInscriptionPersonIds } from "./seminar-participation.server";

const seminarNotFoundMessage = "No encontramos ese seminario.";

type ActiveSeminarInscription = SeminarInscriptionPersonIds & {
  firstName: string;
  id: string;
  lastName: string;
  selectedPriceId: string | null;
  seminarId: string;
};

type PlanSeminar = Pick<
  LockedSeminar,
  "id" | "kind" | "requiredDepositPercentage"
>;

/** The academy's active inscriptions in the seminars, each with its money
 * resolved: what one or both stages of the charge are planned from. */
type SeminarCobroInscriptions = {
  rows: ActiveSeminarInscription[];
  resolutions: ReadonlyMap<string, ResolvedSeminarInscription>;
  seminarsById: ReadonlyMap<string, PlanSeminar>;
};

/**
 * One inscription the charge reaches: it owes something for the stage, or
 * storing its price carries it across its deposit.
 *
 * `priceRow` is **the one row the charge prices with**: the row the inscription
 * holds once the write is done (`chargedPriceRow`) — the one it already held,
 * or the one the write stores. Its owed figures, the deposit it may cross and
 * the name the preview shows all come from it, so the charge can neither stop
 * short of the deposit it holds nor carry it past the total it holds.
 *
 * `owedAmount` is `null` only when no row prices it at all, which refuses the
 * charge. `owedDepositAmount` is what is left of that row's deposit.
 * `overAllocatedAmount` is what the inscription holds past that row's total,
 * which only a row cheaper than the money already on it leaves; storing such a
 * row refuses the charge.
 */
type SeminarCobroLine = ActiveSeminarInscription & {
  crossesDeposit: boolean;
  overAllocatedAmount: number;
  owedAmount: number | null;
  owedDepositAmount: number | null;
  priceRow: SeminarFinancePriceRow | null;
};

type SeminarCobroPlan = {
  /** How many active inscriptions the academy holds across the seminars,
   * reached by the charge or not. */
  activeCount: number;
  lines: SeminarCobroLine[];
  /** Per seminar, the lines that carry an inscription across its deposit: the
   * places the charge would take. */
  crossingIdsBySeminarId: Map<string, string[]>;
};

/**
 * The academy's **active** inscriptions in the seminars (withdrawn ones are
 * never read), with their allocations, participant cell and price rows
 * resolved. Read once, it answers both stages.
 *
 * `lock` takes the inscriptions' rows `FOR UPDATE`, in id order, as the
 * choreography preset does: a withdrawal racing the charge either commits
 * first, and is read here, or waits until the charge has priced and funded.
 * Only the write asks for it, under the seminars' locks; a preview reads
 * without it.
 */
async function readSeminarCobroInscriptions(
  executor: Executor,
  input: {
    academyId: string;
    eventId: string;
    lock?: boolean;
    seminars: readonly PlanSeminar[];
  },
): Promise<SeminarCobroInscriptions> {
  const seminarsById = new Map(
    input.seminars.map((seminar) => [seminar.id, seminar]),
  );
  const filter = {
    academyId: input.academyId,
    seminarIds: [...seminarsById.keys()],
  };

  if (input.lock) {
    await lockActiveSeminarInscriptions(executor, filter);
  }

  const rows = await readActiveSeminarInscriptions(executor, filter);
  const resolutions = await resolveSeminarInscriptions(executor, {
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
  });

  return { resolutions, rows, seminarsById };
}

/**
 * What one stage of the preset would charge: each inscription's price and
 * owed figure for the stage, and the places the crossings would take.
 *
 * Inscriptions that owe nothing for the stage are left out, so running the same
 * preset twice reaches nobody the second time.
 */
function planSeminarCobro(
  inscriptions: SeminarCobroInscriptions,
  stage: CobroStage,
): SeminarCobroPlan {
  const lines = inscriptions.rows.flatMap((row) => {
    const resolution = inscriptions.resolutions.get(row.id);
    const line = resolution
      ? planLine({
          requiredDepositPercentage: inscriptions.seminarsById.get(
            row.seminarId,
          )!.requiredDepositPercentage,
          resolution,
          row,
          stage,
        })
      : null;

    return line ? [line] : [];
  });

  return {
    activeCount: inscriptions.rows.length,
    lines,
    crossingIdsBySeminarId: collectCrossingsBySeminar(lines),
  };
}

/** The academy's active inscriptions in the seminars, read through the person
 * as everywhere on this side. */
function academyInscriptionsIn(input: {
  academyId: string;
  seminarIds: string[];
}) {
  return and(
    inArray(seminarInscriptions.seminarId, input.seminarIds),
    activeSeminarInscription(),
    seminarInscriptionOwnedBy(input.academyId),
  );
}

async function lockActiveSeminarInscriptions(
  executor: Executor,
  input: { academyId: string; seminarIds: string[] },
): Promise<void> {
  if (input.seminarIds.length === 0) {
    return;
  }

  await executor
    .select({ id: seminarInscriptions.id })
    .from(seminarInscriptions)
    .where(academyInscriptionsIn(input))
    .orderBy(asc(seminarInscriptions.id))
    .for("update", { of: seminarInscriptions });
}

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
      firstName: seminarInscriptionPerson.firstName,
      id: seminarInscriptions.id,
      lastName: seminarInscriptionPerson.lastName,
      individualId: seminarInscriptions.individualId,
      professorId: seminarInscriptions.professorId,
      seminarId: seminarInscriptions.seminarId,
      selectedPriceId: seminarInscriptions.selectedPriceId,
    })
    .from(seminarInscriptions)
    .innerJoin(
      seminarInscriptionPerson,
      eq(seminarInscriptionPerson.inscriptionId, seminarInscriptions.id),
    )
    .where(academyInscriptionsIn(input))
    .orderBy(
      seminarInscriptions.seminarId,
      seminarInscriptionPerson.lastName,
      seminarInscriptionPerson.firstName,
      seminarInscriptions.id,
    );
}

/**
 * One inscription's part in the charge, or `null` when it owes nothing for the
 * stage.
 *
 * Everything is derived from the row the inscription **stores** once the write
 * is done (`chargedPriceRow`). A line owing nothing is kept only when storing
 * that row carries the inscription across its deposit: the money it holds
 * already covers the new row's deposit, and the write still has to take the
 * place.
 */
function planLine(input: {
  requiredDepositPercentage: number;
  resolution: ResolvedSeminarInscription;
  row: ActiveSeminarInscription;
  stage: CobroStage;
}): SeminarCobroLine | null {
  const { resolution, row } = input;
  const priceRow = chargedPriceRow(resolution);
  const thresholds = deriveSeminarInscriptionThresholds({
    priceAmount: priceRow?.amount ?? null,
    requiredDepositPercentage: input.requiredDepositPercentage,
  });
  const figures = deriveInscriptionFinancialFigures({
    allocatedAmount: resolution.allocatedAmount,
    thresholds,
  });
  const owedAmount =
    input.stage === "deposit"
      ? figures.owedDepositAmount
      : figures.owedBalanceAmount;
  const crossesDeposit =
    owedAmount !== null &&
    !resolution.covered &&
    hasCrossedDepositThreshold({
      allocatedAmount: resolution.allocatedAmount + owedAmount,
      depositAmount: thresholds.depositAmount,
    });

  if (owedAmount === 0 && !crossesDeposit) {
    return null;
  }

  return {
    ...row,
    crossesDeposit,
    overAllocatedAmount: figures.overAllocatedAmount ?? 0,
    owedAmount,
    owedDepositAmount: figures.owedDepositAmount,
    priceRow,
  };
}

/**
 * The row the charge prices an inscription with, and stores on it.
 *
 * A held row of the person's current participant cell is kept, below the
 * deposit too: somebody picked it on purpose in the allocation dialog, which
 * offers that cell's rows only. A held row of the **other** cell was nobody's
 * choice for this person as they are today: it was stored before they started
 * or stopped dancing, and below the deposit nothing froze that fact, so it is
 * replaced by today's row of their cell — the effective row every other surface
 * already reads. With no row held, today's row is the one stored.
 */
function chargedPriceRow(
  resolution: ResolvedSeminarInscription,
): SeminarFinancePriceRow | null {
  const held = resolution.storedPriceRow;
  const today = resolution.priceRow;

  return held !== null &&
    (today === null || held.forParticipants === today.forParticipants)
    ? held
    : today;
}

/**
 * Stores on each line the row it is charged by, where it holds another or none.
 * A line nothing prices refuses the whole write rather than leaving the
 * inscription unpriced. A seminar opens only when both participant cells have a
 * deadline-less `regular` row, so that is a guard, not a path.
 *
 * A line whose new row is cheaper than the money already on it refuses the
 * write too: storing it would fix a price the inscription is over-allocated
 * against, and take a place with no money moving to check it.
 */
async function storeChargedPrices(
  tx: Executor,
  lines: readonly SeminarCobroLine[],
): Promise<CobroResult> {
  for (const line of lines) {
    if (line.priceRow === null) {
      return {
        ok: false,
        message:
          "No hay un precio de seminario configurado para alguna de las inscripciones.",
      };
    }

    if (line.overAllocatedAmount > 0) {
      return {
        ok: false,
        message: `${seminarOverAllocatedMessage({
          overAllocatedAmount: line.overAllocatedAmount,
          personName: formatDancerName(line),
        })} Quitale la diferencia desde su detalle antes de asignar.`,
      };
    }

    if (line.priceRow.id !== line.selectedPriceId) {
      await tx
        .update(seminarInscriptions)
        .set({ selectedPriceId: line.priceRow.id })
        .where(eq(seminarInscriptions.id, line.id));
    }
  }

  return { ok: true };
}

function collectCrossingsBySeminar(
  lines: readonly SeminarCobroLine[],
): Map<string, string[]> {
  const crossing = new Map<string, string[]>();

  for (const line of lines) {
    if (line.crossesDeposit) {
      crossing.set(line.seminarId, [
        ...(crossing.get(line.seminarId) ?? []),
        line.id,
      ]);
    }
  }

  return crossing;
}

/** One person a stage of the preset reaches, as the preset dialog lists them. */
type SeminarCobroPreviewPerson = {
  /** What the charge allocates to them; `null` when nothing prices them, which
   * the write refuses. */
  amount: number | null;
  inscriptionId: string;
  /** What they hold past the price the charge would store; above zero, the
   * write refuses. */
  overAllocatedAmount: number;
  personName: string;
  /** The row they hold once the charge is written, which is the row the
   * amount is owed by. */
  priceName: string | null;
};

/** What one stage of the preset would do in one seminar. */
type SeminarCobroPreviewStage = {
  /** The places the charge would take: the people it carries across their
   * deposit. */
  neededCount: number;
  people: SeminarCobroPreviewPerson[];
  /** The places other registrations reserve, the charge's own crossings left
   * out: they count as taken. */
  reservedCount: number;
};

/**
 * One seminar of the event as the preset dialog previews it, for both stages,
 * so the dialog can read any selection without asking the server again.
 */
export type SeminarCobroPreview = {
  /** The places already taken, by every academy. */
  coveredCount: number;
  instructorName: string;
  quota: number;
  scheduledDate: string;
  seminarId: string;
  stages: Record<CobroStage, SeminarCobroPreviewStage>;
};

/**
 * The preview of both presets over every seminar of the event, keyed by
 * seminar. It reads the inscriptions once and plans both stages from them with
 * `planSeminarCobro`, the plan the write runs under its locks, so the people,
 * the prices and the places it shows are the ones the write would act on as
 * long as nothing moves in between; when something does, the write's own
 * checks are the last word.
 *
 * A seminar's plan does not depend on the other seminars of a selection, so
 * one plan over all of them answers any selection the dialog is opened on.
 */
export async function readSeminarCobroPreviews(input: {
  academyId: string;
  eventId: string;
}): Promise<Record<string, SeminarCobroPreview>> {
  const eventSeminars = await db
    .select({
      id: seminars.id,
      instructorName: seminars.instructorName,
      kind: seminars.kind,
      quota: seminars.quota,
      requiredDepositPercentage: seminars.requiredDepositPercentage,
      scheduledDate: seminars.scheduledDate,
    })
    .from(seminars)
    .where(eq(seminars.eventId, input.eventId))
    .orderBy(asc(seminars.id));

  if (eventSeminars.length === 0) {
    return {};
  }

  const [placesBySeminarId, inscriptions] = await Promise.all([
    readSeminarPlaces(
      eventSeminars.map((seminar) => seminar.id),
      new Date(),
      db,
    ),
    readSeminarCobroInscriptions(db, { ...input, seminars: eventSeminars }),
  ]);
  const deposit = planSeminarCobro(inscriptions, "deposit");
  const balance = planSeminarCobro(inscriptions, "balance");

  return Object.fromEntries(
    eventSeminars.map((seminar) => [
      seminar.id,
      {
        coveredCount: placesBySeminarId.get(seminar.id)?.coveredIds.length ?? 0,
        instructorName: seminar.instructorName,
        quota: seminar.quota,
        scheduledDate: seminar.scheduledDate,
        seminarId: seminar.id,
        stages: {
          balance: previewStage(
            balance,
            seminar.id,
            placesBySeminarId.get(seminar.id),
          ),
          deposit: previewStage(
            deposit,
            seminar.id,
            placesBySeminarId.get(seminar.id),
          ),
        },
      } satisfies SeminarCobroPreview,
    ]),
  );
}

function previewStage(
  plan: SeminarCobroPlan,
  seminarId: string,
  places: SeminarPlaces | undefined,
): SeminarCobroPreviewStage {
  const crossingIds = plan.crossingIdsBySeminarId.get(seminarId) ?? [];

  return {
    neededCount: crossingIds.length,
    reservedCount: countReservedByOthers(places, crossingIds),
    people: plan.lines
      .filter((line) => line.seminarId === seminarId)
      .map((line) => ({
        amount: line.owedAmount,
        inscriptionId: line.id,
        overAllocatedAmount: line.overAllocatedAmount,
        personName: formatDancerName(line),
        priceName: line.priceRow?.name ?? null,
      })),
  };
}

/**
 * Charges the stage over the selected seminars. The client names the seminars
 * and nothing else: who is charged, at which price and how much is recomputed
 * here, under the seminars' locks and the inscriptions'.
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

    const plan = planSeminarCobro(
      await readSeminarCobroInscriptions(tx, {
        academyId: input.academyId,
        eventId: input.eventId,
        lock: true,
        seminars: locked,
      }),
      input.stage,
    );

    if (plan.activeCount === 0) {
      return {
        ok: false,
        message: "Los seminarios elegidos no tienen inscripciones activas.",
      };
    }

    const places = await assertSeminarPlacesForCrossings(tx, {
      crossingIdsBySeminarId: plan.crossingIdsBySeminarId,
      seminars: locked,
    });

    if (!places.ok) {
      return places;
    }

    const priced = await storeChargedPrices(tx, plan.lines);

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

/**
 * Spreads each line's owed figure from the pool, oldest payment first.
 *
 * A line that crosses its deposit on the way to its balance is funded in two
 * moves, up to the deposit and then the rest. The pool's over-allocation check
 * reads the inscription's **effective** row, which below the deposit is
 * today's and may be cheaper than the row it holds; once the deposit is
 * covered it is the held row, the one the line is priced by, so the rest is
 * checked against the total the charge is aiming at.
 */
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

    for (const amount of fundingMoves(line, line.owedAmount).filter(
      (move) => move > 0,
    )) {
      const funded = await spreadFromPool(tx, {
        academyId: input.academyId,
        amount,
        eventId: input.eventId,
        target: { id: line.id, kind: "seminar" },
      });

      if (!funded.ok) {
        return funded;
      }
    }
  }

  return { ok: true };
}

function fundingMoves(line: SeminarCobroLine, owedAmount: number): number[] {
  const toDeposit = line.owedDepositAmount ?? 0;

  return line.crossesDeposit && toDeposit > 0 && toDeposit < owedAmount
    ? [toDeposit, owedAmount - toDeposit]
    : [owedAmount];
}

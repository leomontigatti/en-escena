import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  dancers,
  events,
} from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import type { ChoreographyReference } from "@/lib/choreographies/choreography-messages";
import {
  buildDancerBirthDateRefusalMessage,
  type DancerBirthDateScheduleMove,
} from "@/lib/choreographies/dancer-birthdate-messages";
import {
  resolveDancerBirthDateScheduleDestination,
  type ScheduleDestination,
} from "@/lib/choreographies/dancer-birthdate-schedule-move.server";
import { refreshActiveInscriptionAges } from "@/lib/choreographies/inscription-age.server";
import type { RecategorisedChoreography } from "@/lib/choreographies/recategorisation-report";
import type { ReservedSchedulePlace } from "@/lib/choreographies/schedule-capacity-lock.server";
import {
  getAgeAtDate,
  getEventLocalDateParts,
  getResolvedCategoryId,
  resolveChoreographyClassificationForResolvedDancers,
  type ChoreographyRegistrationOperationResolution,
  type ResolvedRegistrationDancer,
} from "@/lib/choreographies/registration-resolution.server";
import { getEventBases, type EventBases } from "@/lib/events/bases.server";
import { isExperienceLevel } from "@/lib/events/experience-levels";
import type { ChoreographyGroupType } from "@/lib/finances/operational-summary-calculations.server";
import { findEvaluatedChoreographyIds } from "@/lib/presentations/evaluation-lock.server";

type DatabaseExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];
type QueryExecutor = typeof db | DatabaseExecutor;

type EligibleChoreographyRow = {
  choreographyId: string;
  choreographyNumber: number;
  name: string;
  eventId: string;
  startsAt: Date;
  modalityId: string;
  categoryId: string | null;
  categoryAgeBasis: number | null;
  categoryCalculationMode: "oldest" | "group_tolerance" | "group_average";
  experienceLevelId: string | null;
  groupType: ChoreographyGroupType;
  scheduleId: string;
  correctedDancerCompetitiveAge: number;
};

type LinkedDancerRow = {
  choreographyId: string;
  dancerId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
};

type ChoreographyCompetitivePlacement = {
  categoryId: string | null;
  categoryAgeBasis: number | null;
  categoryCalculationMode: EligibleChoreographyRow["categoryCalculationMode"];
  experienceLevelId: string | null;
  dancerCompetitiveAge: number;
};

/**
 * A blocking choreography as the refusal names it. The same shape the shared
 * formatter reads, so the sentence and the failure never drift apart.
 */
export type DancerBirthDateCorrectionChoreography = ChoreographyReference;

export type { DancerBirthDateScheduleMove };

/**
 * What a correction that went through moved: the choreographies it sent to
 * another show, and the ones it left in another category. Both dancer forms
 * read the same report, each wording its own feedback.
 */
export type DancerBirthDateCorrectionReport = {
  scheduleMoves: DancerBirthDateScheduleMove[];
  recategorisedChoreographies: RecategorisedChoreography[];
};

/** A report of a correction that moved nothing, for the callers that skip it. */
export const emptyDancerBirthDateCorrectionReport: DancerBirthDateCorrectionReport =
  {
    scheduleMoves: [],
    recategorisedChoreographies: [],
  };

export type DancerBirthDateCorrectionResult =
  | ({ ok: true } & DancerBirthDateCorrectionReport)
  | {
      ok: false;
      code: "no-compatible-category";
      choreographiesWithoutCategory: DancerBirthDateCorrectionChoreography[];
    }
  | {
      ok: false;
      code: "no-compatible-schedule";
      choreographiesWithoutSchedule: DancerBirthDateCorrectionChoreography[];
    };

type ChoreographyCorrectionWrite = {
  choreography: EligibleChoreographyRow;
  /** `null` when the correction leaves the choreography without a category. */
  categoryName: string | null;
  placement: ChoreographyCompetitivePlacement;
  resolvedDancers: ResolvedRegistrationDancer[];
};

type CategorisedCorrectionWrite = {
  write: ChoreographyCorrectionWrite;
  categoryId: string;
  categoryName: string;
};

type ScheduledCorrectionWrite = CategorisedCorrectionWrite & {
  move: Extract<ScheduleDestination, { ok: true }>["move"];
};

export async function recalculateLinkedChoreographiesForDancerBirthDateCorrection(input: {
  dancerId: string;
  // The transaction the dancer write runs in, and not the pool: the schedule
  // move below takes a `FOR UPDATE` lock, which guards nothing outside one, and
  // a refusal has to roll the dancer row back with it.
  executor: DatabaseExecutor;
  eventBasesByEventId: Map<string, EventBases>;
}): Promise<DancerBirthDateCorrectionResult> {
  const executor = input.executor;
  const eligibleChoreographies = await listEligibleChoreographies(
    executor,
    input.dancerId,
  );

  if (eligibleChoreographies.length === 0) {
    return { ok: true, ...emptyDancerBirthDateCorrectionReport };
  }

  const writes = await resolveCorrectionWrites({
    correctedDancerId: input.dancerId,
    eligibleChoreographies,
    eventBasesByEventId: input.eventBasesByEventId,
    executor,
  });
  // Every choreography is resolved before anything is written: a correction
  // that would leave one of them without a category, or in a show that does
  // not take it, is refused whole, so the administrator never has to undo a
  // half-applied recalculation.
  const categorised = categoriseCorrectionWrites(writes);

  if (categorised.choreographiesWithoutCategory.length > 0) {
    return {
      ok: false,
      code: "no-compatible-category",
      choreographiesWithoutCategory: categorised.choreographiesWithoutCategory,
    };
  }

  const scheduled = await scheduleCorrectionWrites({
    categorisedWrites: categorised.categorisedWrites,
    executor,
  });

  if (scheduled.choreographiesWithoutSchedule.length > 0) {
    return {
      ok: false,
      code: "no-compatible-schedule",
      choreographiesWithoutSchedule: scheduled.choreographiesWithoutSchedule,
    };
  }

  return {
    ok: true,
    ...(await persistCorrectionWrites({
      executor,
      scheduledWrites: scheduled.scheduledWrites,
    })),
  };
}

/**
 * Every eligible choreography re-classified over the live roster, keeping only
 * the ones the new birth date actually re-places.
 */
async function resolveCorrectionWrites(input: {
  correctedDancerId: string;
  eligibleChoreographies: EligibleChoreographyRow[];
  eventBasesByEventId: Map<string, EventBases>;
  executor: QueryExecutor;
}): Promise<ChoreographyCorrectionWrite[]> {
  const linkedDancers = await input.executor
    .select({
      choreographyId: choreographyDancers.choreographyId,
      dancerId: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
      birthDate: dancers.birthDate,
    })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(choreographyDancers.dancerId, dancers.id))
    // The classification is recomputed over the live roster: a withdrawn
    // inscription contributes no age and does not count towards the group type.
    .where(
      and(
        inArray(
          choreographyDancers.choreographyId,
          input.eligibleChoreographies.map(
            (choreography) => choreography.choreographyId,
          ),
        ),
        activeInscription(),
      ),
    );
  const linkedDancersByChoreographyId =
    groupLinkedDancersByChoreographyId(linkedDancers);
  const writes: ChoreographyCorrectionWrite[] = [];

  for (const choreography of input.eligibleChoreographies) {
    const resolvedDancers = toResolvedDancers(
      linkedDancersByChoreographyId.get(choreography.choreographyId) ?? [],
      getEventLocalDateParts(choreography.startsAt),
    );
    // Loaded before the transaction opened, covering every eligible
    // choreography's event: a miss is a caller that built the map some other
    // way, and reading the bases here would be a pool read inside the
    // transaction the correction runs in.
    const eventBases = input.eventBasesByEventId.get(choreography.eventId);

    if (!eventBases) {
      throw new Error(
        `Missing event bases for event ${choreography.eventId} while correcting a birth date.`,
      );
    }
    const correctedResolvedDancer = resolvedDancers.find(
      (dancer) => dancer.id === input.correctedDancerId,
    );

    if (!correctedResolvedDancer) {
      continue;
    }

    const beforePlacement =
      toCompetitivePlacementFromChoreography(choreography);
    const resolution = resolveChoreographyClassificationForResolvedDancers({
      eventBases,
      modalityId: choreography.modalityId,
      dancers: resolvedDancers,
    });
    const afterPlacement = toCompetitivePlacementFromResolution({
      correctedDancer: correctedResolvedDancer,
      currentExperienceLevelId: beforePlacement.experienceLevelId,
      resolution,
    });

    if (!hasCompetitivePlacementChanged(beforePlacement, afterPlacement)) {
      continue;
    }

    writes.push({
      choreography,
      categoryName:
        resolution.category.status === "resolved"
          ? resolution.category.name
          : null,
      placement: afterPlacement,
      resolvedDancers,
    });
  }

  return writes;
}

/**
 * The writes split by whether the new placement found a category at all. The
 * category is carried beside the write so the column's `NOT NULL` is honoured
 * by the type and not only by the refusal.
 */
function categoriseCorrectionWrites(writes: ChoreographyCorrectionWrite[]) {
  const choreographiesWithoutCategory: DancerBirthDateCorrectionChoreography[] =
    [];
  const categorisedWrites: CategorisedCorrectionWrite[] = [];

  for (const write of writes) {
    const categoryId = write.placement.categoryId;
    const categoryName = write.categoryName;

    if (categoryId === null || categoryName === null) {
      choreographiesWithoutCategory.push(
        toCorrectionChoreography(write.choreography),
      );
      continue;
    }

    categorisedWrites.push({ write, categoryId, categoryName });
  }

  return { categorisedWrites, choreographiesWithoutCategory };
}

/**
 * The same split over the show each choreography belongs to under its new
 * category, with the move — when there is one — already guarded and locked.
 */
async function scheduleCorrectionWrites(input: {
  categorisedWrites: CategorisedCorrectionWrite[];
  executor: DatabaseExecutor;
}) {
  const choreographiesWithoutSchedule: DancerBirthDateCorrectionChoreography[] =
    [];
  const scheduledWrites: ScheduledCorrectionWrite[] = [];
  // Every destination is resolved before a single row is written, so the places
  // the loop already granted exist nowhere the capacity lock can count them.
  // They travel with each resolution instead.
  const reservedPlaces: ReservedSchedulePlace[] = [];

  for (const { write, categoryId, categoryName } of input.categorisedWrites) {
    const destination = await resolveDancerBirthDateScheduleDestination({
      categoryId,
      choreography: write.choreography,
      executor: input.executor,
      reservedPlaces,
    });

    if (!destination.ok) {
      choreographiesWithoutSchedule.push(
        toCorrectionChoreography(write.choreography),
      );
      continue;
    }

    if (destination.move) {
      reservedPlaces.push({
        scheduleId: destination.move.scheduleId,
        scheduleCapacityId: destination.move.scheduleCapacityId,
      });
    }

    scheduledWrites.push({
      write,
      categoryId,
      categoryName,
      move: destination.move,
    });
  }

  return { choreographiesWithoutSchedule, scheduledWrites };
}

/**
 * The writes, applied, reporting the choreographies that changed show and the
 * ones that changed category.
 */
async function persistCorrectionWrites(input: {
  executor: QueryExecutor;
  scheduledWrites: ScheduledCorrectionWrite[];
}): Promise<DancerBirthDateCorrectionReport> {
  const scheduleMoves: DancerBirthDateScheduleMove[] = [];
  const recategorisedChoreographies: RecategorisedChoreography[] = [];

  for (const {
    write,
    categoryId,
    categoryName,
    move,
  } of input.scheduledWrites) {
    await persistResolvedDancers({
      choreographyId: write.choreography.choreographyId,
      executor: input.executor,
      resolvedDancers: write.resolvedDancers,
    });
    await input.executor
      .update(choreographies)
      .set({
        categoryId,
        categoryCalculationMode: write.placement.categoryCalculationMode,
        categoryAgeBasis: write.placement.categoryAgeBasis,
        experienceLevelId: toExperienceLevelValue(
          write.placement.experienceLevelId,
        ),
        updatedAt: new Date(),
        ...(move
          ? {
              scheduleId: move.scheduleId,
              scheduleCapacityId: move.scheduleCapacityId,
            }
          : {}),
      })
      .where(eq(choreographies.id, write.choreography.choreographyId));

    if (move) {
      scheduleMoves.push({
        choreography: toCorrectionChoreography(write.choreography),
        scheduleName: move.scheduleName,
      });
    }

    // Only a category change is reported: a row whose competitive age moved
    // inside the same category reads the same to the user.
    if (write.choreography.categoryId !== categoryId) {
      recategorisedChoreographies.push({
        choreographyId: write.choreography.choreographyId,
        name: write.choreography.name,
        categoryName,
        experienceLevelCleared:
          write.choreography.experienceLevelId !== null &&
          write.placement.experienceLevelId === null,
      });
    }
  }

  return { scheduleMoves, recategorisedChoreographies };
}

/**
 * A refusal raised from inside a dancer-write transaction. Returning a failure
 * from a Drizzle transaction callback **commits**, so the dancer row would keep
 * the birth date that leaves a choreography without a category. Throwing rolls
 * both back; `runDancerWriteWithBirthDateCorrection` turns it back into the
 * structured failure the forms expect.
 *
 * Deliberately not named `…Error`: it carries a user's refusal, not engineering
 * prose. See the `CobroRefusal` precedent in
 * `.sandcastle/CODING_STANDARDS.md`.
 */
class DancerBirthDateCorrectionRefusal extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "DancerBirthDateCorrectionRefusal";
  }
}

/**
 * The recalculation as a transaction step: it either applies, or aborts the
 * transaction with the refusal the runner below catches. Both dancer forms go
 * through this pair rather than each deciding how a refusal crosses the
 * transaction boundary.
 */
export async function applyDancerBirthDateCorrection(input: {
  dancerId: string;
  executor: DatabaseExecutor;
  eventBasesByEventId: Map<string, EventBases>;
}): Promise<DancerBirthDateCorrectionReport> {
  const recalculation =
    await recalculateLinkedChoreographiesForDancerBirthDateCorrection(input);

  if (!recalculation.ok) {
    throw new DancerBirthDateCorrectionRefusal(
      recalculation.code === "no-compatible-category"
        ? buildDancerBirthDateCorrectionRefusalMessage(
            recalculation.choreographiesWithoutCategory,
          )
        : buildDancerBirthDateScheduleRefusalMessage(
            recalculation.choreographiesWithoutSchedule,
          ),
    );
  }

  return {
    scheduleMoves: recalculation.scheduleMoves,
    recategorisedChoreographies: recalculation.recategorisedChoreographies,
  };
}

/**
 * Runs a dancer write whose transaction may refuse a birth-date correction.
 * The refusal comes back as the sentence for the `birthDate` field, leaving
 * each form to word its own summary; anything else keeps propagating.
 *
 * Whatever the write returns — the dancer row and what the correction moved —
 * crosses the transaction boundary here, so neither caller has to smuggle it
 * out of its own closure.
 */
export async function runDancerWriteWithBirthDateCorrection<TResult>(
  write: (executor: DatabaseExecutor) => Promise<TResult>,
): Promise<
  { ok: true; result: TResult } | { ok: false; birthDateMessage: string }
> {
  try {
    return { ok: true, result: await db.transaction(write) };
  } catch (error) {
    if (error instanceof DancerBirthDateCorrectionRefusal) {
      return { ok: false, birthDateMessage: error.reason };
    }

    throw error;
  }
}

/**
 * Names the choreographies a birth-date correction would leave without a
 * category, for the birth date field of both dancer forms.
 */
export function buildDancerBirthDateCorrectionRefusalMessage(
  choreographiesWithoutCategory: DancerBirthDateCorrectionChoreography[],
): string {
  return buildDancerBirthDateRefusalMessage(
    choreographiesWithoutCategory,
    "sin categoría",
  );
}

/**
 * Names the choreographies a birth-date correction would leave in a show that
 * does not take their new category — with no other show to move them to, none
 * with room, or several to choose between.
 */
function buildDancerBirthDateScheduleRefusalMessage(
  choreographiesWithoutSchedule: DancerBirthDateCorrectionChoreography[],
): string {
  return buildDancerBirthDateRefusalMessage(
    choreographiesWithoutSchedule,
    "sin cronograma compatible",
  );
}

function toCorrectionChoreography(
  choreography: EligibleChoreographyRow,
): DancerBirthDateCorrectionChoreography {
  return {
    choreographyNumber: choreography.choreographyNumber,
    name: choreography.name,
  };
}

export async function loadLinkedChoreographyEventBasesForDancerBirthDateCorrection(input: {
  dancerId: string;
}) {
  const eligibleChoreographies = await listEligibleChoreographies(
    db,
    input.dancerId,
  );
  const eventIds = [
    ...new Set(eligibleChoreographies.map((row) => row.eventId)),
  ];
  const eventBasesEntries = await Promise.all(
    eventIds.map(
      async (eventId) => [eventId, await getEventBases(eventId)] as const,
    ),
  );

  return new Map(eventBasesEntries);
}

/**
 * The choreographies a birth-date correction may re-place the dancer in: the
 * active inscriptions they belong to, minus the ones already evaluated. The
 * evaluated ones are filtered in memory and not in the `where`, because being
 * evaluated is not a column of the choreography any more but an answer the
 * seam gives — see evaluation-lock.server.ts.
 */
async function listEligibleChoreographies(
  executor: QueryExecutor,
  dancerId: string,
) {
  const rows = await executor
    .select({
      choreographyId: choreographies.id,
      choreographyNumber: choreographies.choreographyNumber,
      name: choreographies.name,
      eventId: choreographies.eventId,
      startsAt: events.startsAt,
      modalityId: choreographies.modalityId,
      categoryId: choreographies.categoryId,
      categoryAgeBasis: choreographies.categoryAgeBasis,
      categoryCalculationMode: choreographies.categoryCalculationMode,
      experienceLevelId: choreographies.experienceLevelId,
      groupType: choreographies.groupType,
      scheduleId: choreographies.scheduleId,
      correctedDancerCompetitiveAge: choreographyDancers.ageAtEventStart,
    })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographyDancers.choreographyId, choreographies.id),
    )
    .innerJoin(events, eq(choreographies.eventId, events.id))
    .where(
      and(eq(choreographyDancers.dancerId, dancerId), activeInscription()),
    );
  const evaluatedIds = await findEvaluatedChoreographyIds(
    rows.map((row) => row.choreographyId),
    executor,
  );

  return rows.filter((row) => !evaluatedIds.has(row.choreographyId));
}

function toCompetitivePlacementFromChoreography(
  choreography: EligibleChoreographyRow,
): ChoreographyCompetitivePlacement {
  return {
    categoryId: choreography.categoryId,
    categoryAgeBasis: choreography.categoryAgeBasis,
    categoryCalculationMode: choreography.categoryCalculationMode,
    experienceLevelId: choreography.experienceLevelId,
    dancerCompetitiveAge: choreography.correctedDancerCompetitiveAge,
  };
}

function toCompetitivePlacementFromResolution(input: {
  correctedDancer: ResolvedRegistrationDancer;
  currentExperienceLevelId: string | null;
  resolution: Pick<
    ChoreographyRegistrationOperationResolution,
    | "category"
    | "categoryAgeBasis"
    | "categoryCalculationMode"
    | "experienceLevel"
  >;
}): ChoreographyCompetitivePlacement {
  return {
    categoryId: getResolvedCategoryId(input.resolution.category),
    categoryAgeBasis: input.resolution.categoryAgeBasis,
    categoryCalculationMode: input.resolution.categoryCalculationMode,
    experienceLevelId: resolveRetainedExperienceLevelId({
      currentExperienceLevelId: input.currentExperienceLevelId,
      resolution: input.resolution,
    }),
    dancerCompetitiveAge: input.correctedDancer.ageAtEventStart,
  };
}

function hasCompetitivePlacementChanged(
  before: ChoreographyCompetitivePlacement,
  after: ChoreographyCompetitivePlacement,
) {
  return (
    before.categoryId !== after.categoryId ||
    before.categoryCalculationMode !== after.categoryCalculationMode ||
    before.categoryAgeBasis !== after.categoryAgeBasis ||
    before.experienceLevelId !== after.experienceLevelId ||
    before.dancerCompetitiveAge !== after.dancerCompetitiveAge
  );
}

function toExperienceLevelValue(value: string | null) {
  if (value === null || !isExperienceLevel(value)) {
    return null;
  }

  return value;
}

function groupLinkedDancersByChoreographyId(linkedDancers: LinkedDancerRow[]) {
  const linkedDancersByChoreographyId = new Map<string, LinkedDancerRow[]>();

  for (const linkedDancer of linkedDancers) {
    const choreographyLinkedDancers =
      linkedDancersByChoreographyId.get(linkedDancer.choreographyId) ?? [];
    choreographyLinkedDancers.push(linkedDancer);
    linkedDancersByChoreographyId.set(
      linkedDancer.choreographyId,
      choreographyLinkedDancers,
    );
  }

  return linkedDancersByChoreographyId;
}

async function persistResolvedDancers(input: {
  choreographyId: string;
  executor: QueryExecutor;
  resolvedDancers: ResolvedRegistrationDancer[];
}) {
  await refreshActiveInscriptionAges(input.executor, {
    choreographyId: input.choreographyId,
    ageByDancerId: new Map(
      input.resolvedDancers.map((dancer) => [
        dancer.id,
        dancer.ageAtEventStart,
      ]),
    ),
  });
}

function toResolvedDancers(
  linkedDancers: LinkedDancerRow[],
  eventLocalStartDate: ReturnType<typeof getEventLocalDateParts>,
) {
  return linkedDancers.map(
    (dancer) =>
      ({
        id: dancer.dancerId,
        firstName: dancer.firstName,
        lastName: dancer.lastName,
        ageAtEventStart: getAgeAtDate(dancer.birthDate, eventLocalStartDate),
      }) satisfies ResolvedRegistrationDancer,
  );
}

function resolveRetainedExperienceLevelId(input: {
  currentExperienceLevelId: string | null;
  resolution: Pick<
    ChoreographyRegistrationOperationResolution,
    "experienceLevel"
  >;
}) {
  if (!input.resolution.experienceLevel.required) {
    return null;
  }

  if (
    input.currentExperienceLevelId &&
    isExperienceLevel(input.currentExperienceLevelId) &&
    input.resolution.experienceLevel.options.some(
      (option) => option.id === input.currentExperienceLevelId,
    )
  ) {
    return input.currentExperienceLevelId;
  }

  return null;
}

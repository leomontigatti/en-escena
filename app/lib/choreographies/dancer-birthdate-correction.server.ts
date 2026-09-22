import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  dancers,
  events,
} from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import {
  formatChoreographyReferences,
  type ChoreographyReference,
} from "@/lib/choreographies/choreography-messages";
import { refreshActiveInscriptionAges } from "@/lib/choreographies/inscription-age.server";
import {
  getAgeAtDate,
  getEventLocalDateParts,
  resolveChoreographyClassificationForResolvedDancers,
  type ChoreographyRegistrationOperationResolution,
  type ResolvedRegistrationDancer,
} from "@/lib/choreographies/registration-resolution.server";
import { getEventBases, type EventBases } from "@/lib/events/bases.server";
import { isExperienceLevel } from "@/lib/events/experience-levels";
import type { RecategorisedChoreography } from "@/lib/choreographies/recategorisation-report";
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

export type DancerBirthDateCorrectionResult =
  | { ok: true; recategorisedChoreographies: RecategorisedChoreography[] }
  | {
      ok: false;
      code: "no-compatible-category";
      choreographiesWithoutCategory: DancerBirthDateCorrectionChoreography[];
    };

type ChoreographyCorrectionWrite = {
  choreography: EligibleChoreographyRow;
  /** `null` when the correction leaves the choreography without a category. */
  categoryName: string | null;
  placement: ChoreographyCompetitivePlacement;
  resolvedDancers: ResolvedRegistrationDancer[];
};

export async function recalculateLinkedChoreographiesForDancerBirthDateCorrection(input: {
  dancerId: string;
  executor?: QueryExecutor;
  eventBasesByEventId?: Map<string, EventBases>;
}): Promise<DancerBirthDateCorrectionResult> {
  const executor = input.executor ?? db;
  const eligibleChoreographies = await listEligibleChoreographies(
    executor,
    input.dancerId,
  );

  if (eligibleChoreographies.length === 0) {
    return { ok: true, recategorisedChoreographies: [] };
  }

  const writes = await planChoreographyCorrections({
    dancerId: input.dancerId,
    eligibleChoreographies,
    eventBasesByEventId: input.eventBasesByEventId,
    executor,
  });

  // Every choreography is resolved before anything is written: a correction
  // that would leave one of them without a category is refused whole, so the
  // administrator never has to undo a half-applied recalculation.
  const choreographiesWithoutCategory = writes
    .filter((write) => toCategorisedWrite(write) === null)
    .map((write) => toCorrectionChoreography(write.choreography));

  if (choreographiesWithoutCategory.length > 0) {
    return {
      ok: false,
      code: "no-compatible-category",
      choreographiesWithoutCategory,
    };
  }

  return {
    ok: true,
    recategorisedChoreographies: await persistChoreographyCorrections(
      executor,
      writes.flatMap((write) => toCategorisedWrite(write) ?? []),
    ),
  };
}

/**
 * What the correction would write, one entry per choreography whose
 * competitive placement the new birth date moves. Nothing is persisted here.
 */
async function planChoreographyCorrections(input: {
  dancerId: string;
  eligibleChoreographies: EligibleChoreographyRow[];
  eventBasesByEventId?: Map<string, EventBases>;
  executor: QueryExecutor;
}) {
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
    const eventBases =
      input.eventBasesByEventId?.get(choreography.eventId) ??
      (await getEventBases(choreography.eventId));
    const resolution = resolveChoreographyClassificationForResolvedDancers({
      eventBases,
      modalityId: choreography.modalityId,
      dancers: resolvedDancers,
    });
    const correctedResolvedDancer = resolvedDancers.find(
      (dancer) => dancer.id === input.dancerId,
    );

    if (!correctedResolvedDancer) {
      continue;
    }

    const beforePlacement =
      toCompetitivePlacementFromChoreography(choreography);
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
 * The category a write is about to persist, carried beside the write so the
 * column's `NOT NULL` is honoured by the type and not only by the refusal.
 * `null` is the write the refusal above names.
 */
function toCategorisedWrite(write: ChoreographyCorrectionWrite) {
  const categoryId = write.placement.categoryId;
  const categoryName = write.categoryName;

  if (categoryId === null || categoryName === null) {
    return null;
  }

  return { write, categoryId, categoryName };
}

/** Writes every planned correction and reports the ones that changed category. */
async function persistChoreographyCorrections(
  executor: QueryExecutor,
  categorisedWrites: NonNullable<ReturnType<typeof toCategorisedWrite>>[],
) {
  const recategorisedChoreographies: RecategorisedChoreography[] = [];

  for (const { write, categoryId, categoryName } of categorisedWrites) {
    await persistResolvedDancers({
      choreographyId: write.choreography.choreographyId,
      executor,
      resolvedDancers: write.resolvedDancers,
    });
    await executor
      .update(choreographies)
      .set({
        categoryId,
        categoryCalculationMode: write.placement.categoryCalculationMode,
        categoryAgeBasis: write.placement.categoryAgeBasis,
        experienceLevelId: toExperienceLevelValue(
          write.placement.experienceLevelId,
        ),
        updatedAt: new Date(),
      })
      .where(eq(choreographies.id, write.choreography.choreographyId));

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

  return recategorisedChoreographies;
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
  executor: QueryExecutor;
  eventBasesByEventId?: Map<string, EventBases>;
}): Promise<RecategorisedChoreography[]> {
  const recalculation =
    await recalculateLinkedChoreographiesForDancerBirthDateCorrection(input);

  if (!recalculation.ok) {
    throw new DancerBirthDateCorrectionRefusal(
      buildDancerBirthDateCorrectionRefusalMessage(
        recalculation.choreographiesWithoutCategory,
      ),
    );
  }

  return recalculation.recategorisedChoreographies;
}

/**
 * Runs a dancer write whose transaction may refuse a birth-date correction.
 * The refusal comes back as the sentence for the `birthDate` field, leaving
 * each form to word its own summary; anything else keeps propagating.
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
  const isSingular = choreographiesWithoutCategory.length === 1;
  const list = formatChoreographyReferences(choreographiesWithoutCategory);
  const subject = isSingular
    ? `la coreografía ${list}`
    : `las coreografías ${list}`;

  return `Con esta fecha de nacimiento, ${subject} ${isSingular ? "queda" : "quedan"} sin categoría.`;
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
    categoryId: getResolvedCategoryId(input.resolution),
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

function getResolvedCategoryId(
  resolution: Pick<ChoreographyRegistrationOperationResolution, "category">,
) {
  return resolution.category.status === "resolved"
    ? resolution.category.id
    : null;
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

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, choreographyDancers } from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import {
  getScheduleSelectionId,
  isCompatibleScheduleCapacity,
  resolveChoreographyDancerUpdateContext,
  resolveSelectedExperienceLevelId,
  resolveSelectedScheduleCapacityIdForDancerUpdate,
} from "@/lib/choreographies/choreography-roster-dancer-update.server";
import {
  updateChoreographyProfessors,
  validateChoreographyProfessorSelection,
} from "@/lib/choreographies/choreography-roster-professor-update.server";
import {
  compatibleScheduleSelectionRequiredMessage,
  getDancerEditingEligibility,
  getResolvedChoreographyCategory,
  haveSameIds,
  type UpdateChoreographyDancersResult,
  type UpdateChoreographyResult,
} from "@/lib/choreographies/choreography-roster.shared";
import {
  removeInscriptionsFromRoster,
  reviveWithdrawnInscriptions,
} from "@/lib/choreographies/inscription-withdrawal.server";
import { guardAndLockScheduleCapacityMove } from "@/lib/choreographies/schedule-capacity-lock.server";

/**
 * administration edits the roster (dancers and professors) of an
 * already-created choreography. Unlike the portal, it is not tied to the
 * registration window: the only hard lock is the choreography already having a
 * presentation attached.
 *
 * Unlike the portal's wholesale replacement, the inscriptions that stay are
 * left untouched (watermark: a `señada` does not fall back to `impaga`).
 * Adding a dancer → a new inscription, or the revived one if it was already
 * withdrawn; removing one → a physical delete without evidence, a withdrawal
 * with it (`removeInscriptionsFromRoster`). Money moves in neither case.
 *
 * `name` is optional and travels here so the admin detail can save name and
 * roster in a single submit. When the dancers change it is persisted inside the
 * same transaction as the roster. An isolated rename does not come through
 * here: it uses `rename-choreography`, which has no presentation hard lock.
 */
export async function updateAdministrativeChoreographyRoster(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  dancerIds: string[];
  professorIds: string[];
  experienceLevelId: string | null;
  name?: string;
  scheduleCapacityId?: string | null;
}): Promise<UpdateChoreographyResult> {
  const hardLock = await readRosterHardLock(input.choreographyId);

  if (hardLock) {
    return { ok: false, section: "dancers", message: hardLock };
  }

  const [currentDancerLinks, currentProfessorLinks] = await Promise.all([
    db
      .select({ dancerId: choreographyDancers.dancerId })
      .from(choreographyDancers)
      .where(
        and(
          eq(choreographyDancers.choreographyId, input.choreographyId),
          activeInscription(),
        ),
      ),
    db.query.choreographyProfessors
      .findMany({
        columns: { professorId: true },
        where: (row, { eq: whereEq }) =>
          whereEq(row.choreographyId, input.choreographyId),
      })
      .then((rows) => rows.map((row) => row.professorId)),
  ]);

  const dancerIdsChanged = !haveSameIds(
    currentDancerLinks.map((row) => row.dancerId),
    input.dancerIds,
  );
  const professorIdsChanged = !haveSameIds(
    currentProfessorLinks,
    input.professorIds,
  );

  if (!dancerIdsChanged && !professorIdsChanged) {
    await renameChoreographyIfNeeded(input);

    return { ok: true };
  }

  if (professorIdsChanged) {
    const professorValidation = await validateChoreographyProfessorSelection({
      academyId: input.academyId,
      choreographyId: input.choreographyId,
      professorIds: input.professorIds,
    });

    if (!professorValidation.ok) {
      return {
        ok: false,
        section: "professors",
        message: professorValidation.message,
      };
    }
  }

  if (dancerIdsChanged) {
    const dancerResult = await updateChoreographyDancers(input);

    if (!dancerResult.ok) {
      return {
        ok: false,
        section: "dancers",
        message: dancerResult.message,
        code: dancerResult.code,
        fieldErrors: dancerResult.fieldErrors,
      };
    }
  }

  if (professorIdsChanged) {
    const professorResult = await updateChoreographyProfessors({
      academyId: input.academyId,
      eventId: input.eventId,
      choreographyId: input.choreographyId,
      professorIds: input.professorIds,
    });

    if (!professorResult.ok) {
      return {
        ok: false,
        section: "professors",
        message: professorResult.message,
      };
    }
  }

  if (!dancerIdsChanged) {
    await renameChoreographyIfNeeded(input);
  }

  return { ok: true };
}

async function renameChoreographyIfNeeded(input: {
  choreographyId: string;
  name?: string;
}) {
  if (input.name === undefined) {
    return;
  }

  await db
    .update(choreographies)
    .set({ name: input.name, updatedAt: new Date() })
    .where(eq(choreographies.id, input.choreographyId));
}

async function updateChoreographyDancers(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  dancerIds: string[];
  experienceLevelId: string | null;
  name?: string;
  scheduleCapacityId?: string | null;
}): Promise<UpdateChoreographyDancersResult> {
  const resolvedUpdate = await resolveChoreographyDancerUpdateContext(input);

  if (!resolvedUpdate.ok) {
    return resolvedUpdate;
  }

  const { choreography, resolvedDancers, resolution, scheduleResolution } =
    resolvedUpdate;

  const resolvedExperienceLevelId = resolveSelectedExperienceLevelId({
    currentCategoryId: choreography.categoryId,
    currentExperienceLevelId: choreography.experienceLevelId,
    experienceLevelId: input.experienceLevelId,
    resolution,
  });

  if (!resolvedExperienceLevelId.ok) {
    return {
      ok: false,
      message: resolvedExperienceLevelId.message,
      fieldErrors: resolvedExperienceLevelId.fieldErrors,
    };
  }

  const resolvedScheduleCapacityId =
    resolveSelectedScheduleCapacityIdForDancerUpdate({
      schedule: scheduleResolution,
      scheduleCapacityId: input.scheduleCapacityId ?? null,
    });

  if (!resolvedScheduleCapacityId.ok) {
    return {
      ok: false,
      message: resolvedScheduleCapacityId.message,
      fieldErrors: resolvedScheduleCapacityId.fieldErrors,
    };
  }

  const selectedSchedule = resolvedScheduleCapacityId.value;

  // #730: final, explicit revalidation that the capacity about to be persisted is
  // still compatible with the groupType resolved in *this same submit*,
  // independent of `scheduleCapacityChanged` below. Every branch that builds
  // `selectedSchedule` already draws it from `resolution`'s own compatible
  // set (see `resolveDancerUpdateScheduleSelection` /
  // `resolveSelectedScheduleCapacityIdForDancerUpdate`), so this should never
  // actually reject anything today — it's a defense-in-depth gate against a
  // future change to those branches silently breaking that guarantee, not a
  // currently reachable rejection. Cheap and needs no transaction/lock, so it
  // runs before entering one: a different, unconditional concern from the
  // capacity-lock/frozen-price guard (#659) right below, which only fires
  // when the capacity axis actually moves.
  if (
    !isCompatibleScheduleCapacity(
      getScheduleSelectionId(selectedSchedule),
      resolution,
    )
  ) {
    return {
      ok: false,
      code: "schedule-capacity",
      message: compatibleScheduleSelectionRequiredMessage,
    };
  }

  const requestedDancerIds = new Set(
    resolvedDancers.map((dancer) => dancer.id),
  );
  // The resolution always recomputes scheduleId/scheduleCapacityId, even when
  // the roster edit lands on the same capacity it already occupies (e.g. a name-
  // only save, or a dancer swap that keeps the same group type). The guard and
  // the lock below must fire only on an actual move, or every unrelated save
  // would pay their cost — and a save that changes nothing on this axis would
  // wrongly report the capacity it already holds as full.
  // A choreography row stores exactly one of the pair populated: a specific
  // capacity (`scheduleCapacityId`) or the whole schedule (`scheduleId`, with
  // `scheduleCapacityId` left null). `scheduleId` on its own is therefore not
  // a reliable diff target when a capacity is assigned — the capacity's own id already
  // determines its schedule, and comparing raw `scheduleId` in that case
  // would read every save that keeps the same capacity as a move. `scheduleId`
  // only carries the comparison when the destination selection has no capacity
  // of its own (the whole-schedule case).
  const scheduleCapacityChanged =
    choreography.scheduleCapacityId !== selectedSchedule.scheduleCapacityId ||
    (selectedSchedule.scheduleCapacityId === null &&
      choreography.scheduleId !== selectedSchedule.scheduleId);

  const transactionResult = await db.transaction(async (tx) => {
    if (scheduleCapacityChanged) {
      // Checked first and inside the transaction, before any roster write:
      // on rejection nothing about this save should be persisted. Same
      // guard-then-lock pair as the standalone reassignment, so the two
      // entry points can't drift on order or on which move counts as frozen.
      const move = await guardAndLockScheduleCapacityMove({
        choreographyId: input.choreographyId,
        // The group type of *this* submit, derived from the post-edit dancer
        // count: on this path the price key can move through the group type
        // alone, and pricing the move against the outgoing one would evaluate
        // a solo that just became a duo against solo prices.
        destinationGroupType: resolution.groupType,
        scheduleCapacityId: selectedSchedule.scheduleCapacityId,
        scheduleId: selectedSchedule.scheduleId,
        tx,
      });

      if (!move.ok) {
        return {
          ok: false as const,
          code: "schedule-capacity" as const,
          message: move.error,
        };
      }
    }

    const [currentLinks, withdrawnLinks] = await Promise.all([
      tx
        .select({
          id: choreographyDancers.id,
          dancerId: choreographyDancers.dancerId,
        })
        .from(choreographyDancers)
        .where(
          and(
            eq(choreographyDancers.choreographyId, input.choreographyId),
            activeInscription(),
          ),
        ),
      // The withdrawn ones are read on purpose: they are the candidates for
      // revival, and until they are revived they take part in nothing else.
      tx
        .select({
          id: choreographyDancers.id,
          dancerId: choreographyDancers.dancerId,
        })
        .from(choreographyDancers)
        .where(
          and(
            eq(choreographyDancers.choreographyId, input.choreographyId),
            isNotNull(choreographyDancers.withdrawnAt),
          ),
        ),
    ]);
    const currentDancerIds = new Set(currentLinks.map((row) => row.dancerId));
    const withdrawnInscriptionIdByDancerId = new Map(
      withdrawnLinks.map((row) => [row.dancerId, row.id]),
    );

    await removeInscriptionsFromRoster(
      tx,
      currentLinks
        .filter((link) => !requestedDancerIds.has(link.dancerId))
        .map((link) => link.id),
    );

    const addedDancers = resolvedDancers.filter(
      (dancer) => !currentDancerIds.has(dancer.id),
    );

    await reviveWithdrawnInscriptions(
      tx,
      addedDancers.flatMap((dancer) => {
        const inscriptionId = withdrawnInscriptionIdByDancerId.get(dancer.id);

        return inscriptionId
          ? [{ ageAtEventStart: dancer.ageAtEventStart, id: inscriptionId }]
          : [];
      }),
    );

    const insertedDancers = addedDancers.filter(
      (dancer) => !withdrawnInscriptionIdByDancerId.has(dancer.id),
    );

    if (insertedDancers.length > 0) {
      await tx.insert(choreographyDancers).values(
        insertedDancers.map((dancer) => ({
          choreographyId: input.choreographyId,
          dancerId: dancer.id,
          ageAtEventStart: dancer.ageAtEventStart,
        })),
      );
    }

    await tx
      .update(choreographies)
      .set({
        groupType: resolution.groupType,
        categoryId: getResolvedChoreographyCategory(resolution).id,
        categoryCalculationMode: resolution.categoryCalculationMode,
        categoryAgeBasis: resolution.categoryAgeBasis,
        experienceLevelId: resolvedExperienceLevelId.value,
        scheduleId: selectedSchedule.scheduleId,
        scheduleCapacityId: selectedSchedule.scheduleCapacityId,
        ...(input.name === undefined ? {} : { name: input.name }),
        updatedAt: new Date(),
      })
      .where(eq(choreographies.id, input.choreographyId));

    return { ok: true as const };
  });

  if (!transactionResult.ok) {
    return {
      ok: false,
      code: transactionResult.code,
      message: transactionResult.message,
    };
  }

  return { ok: true };
}

async function readRosterHardLock(
  choreographyId: string,
): Promise<string | null> {
  const choreography = await db.query.choreographies.findFirst({
    columns: { hasPresentation: true },
    where: eq(choreographies.id, choreographyId),
  });

  const eligibility = getDancerEditingEligibility({
    hasPresentation: choreography?.hasPresentation ?? false,
  });

  return eligibility.canEdit ? null : eligibility.reasonText;
}

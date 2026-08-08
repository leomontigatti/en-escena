import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, choreographyDancers } from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import {
  resolveChoreographyDancerUpdateContext,
  resolveSelectedExperienceLevelId,
  resolveSelectedScheduleCapacityIdForDancerUpdate,
} from "@/lib/choreographies/choreography-roster-dancer-update.server";
import {
  updateChoreographyProfessors,
  validateChoreographyProfessorSelection,
} from "@/lib/choreographies/choreography-roster-professor-update.server";
import {
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

/**
 * Administración edita el roster (bailarines y profesores) de una coreografía ya
 * creada. A diferencia del portal, no está atada a la ventana de inscripción: el
 * único bloqueo duro es que la coreografía ya tenga una presentación asociada.
 *
 * A diferencia del reemplazo total del portal, las inscripciones que se
 * mantienen no se tocan (marca de agua: una `señada` no vuelve a `impaga`). Alta
 * de bailarín → inscripción nueva, o la revivida si ya estaba retirada; baja →
 * borrado físico sin evidencia, retiro con ella (`removeInscriptionsFromRoster`).
 * La plata no se mueve en ninguno de los dos casos.
 *
 * `name` es opcional y viaja acá para que el detalle admin pueda guardar nombre y
 * roster en un solo submit. Cuando cambian los bailarines se persiste dentro de la
 * misma transacción que el roster. Un rename aislado no pasa por acá: usa
 * `rename-choreography`, que no tiene el hard lock por presentación.
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
  const requestedDancerIds = new Set(
    resolvedDancers.map((dancer) => dancer.id),
  );

  await db.transaction(async (tx) => {
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
      // Las retiradas se leen a propósito: son las candidatas a revivir, y
      // hasta que se revivan no participan de nada más.
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
  });

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

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, choreographyDancers } from "@/db/schema";
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
  type UpdateChoreographyDancersResult,
  type UpdateChoreographyResult,
} from "@/lib/choreographies/choreography-roster.shared";
import { releaseInscriptionAllocations } from "@/lib/finances/choreography-cobro.server";

/**
 * Administración edita el roster (bailarines y profesores) de una coreografía ya
 * creada. A diferencia del portal, no está atada a la ventana de inscripción: el
 * único bloqueo duro es que la coreografía ya tenga una presentación asociada.
 *
 * A diferencia del reemplazo total del portal, las inscripciones que se
 * mantienen no se tocan (marca de agua: una `señada` no vuelve a `impaga`). Alta
 * de bailarín → nueva inscripción `impaga` a precio tentativo; baja → borrado
 * físico + devolución de todo lo asignado al `Saldo disponible`.
 */
export async function updateAdministrativeChoreographyRoster(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  dancerIds: string[];
  professorIds: string[];
  experienceLevelId: string | null;
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
      .where(eq(choreographyDancers.choreographyId, input.choreographyId)),
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
    const dancerResult = await updateAdministrativeChoreographyDancers(input);

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

  return { ok: true };
}

async function updateAdministrativeChoreographyDancers(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  dancerIds: string[];
  experienceLevelId: string | null;
  scheduleCapacityId?: string | null;
}): Promise<UpdateChoreographyDancersResult> {
  const resolvedUpdate = await resolveChoreographyDancerUpdateContext({
    ...input,
    isRegistrationOpen: true,
  });

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
    const currentLinks = await tx
      .select({
        id: choreographyDancers.id,
        dancerId: choreographyDancers.dancerId,
      })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.choreographyId, input.choreographyId));
    const currentDancerIds = new Set(currentLinks.map((row) => row.dancerId));

    for (const link of currentLinks) {
      if (requestedDancerIds.has(link.dancerId)) {
        continue;
      }

      await releaseInscriptionAllocations({ inscriptionId: link.id }, tx);
      await tx
        .delete(choreographyDancers)
        .where(eq(choreographyDancers.id, link.id));
    }

    const addedDancers = resolvedDancers.filter(
      (dancer) => !currentDancerIds.has(dancer.id),
    );

    if (addedDancers.length > 0) {
      await tx.insert(choreographyDancers).values(
        addedDancers.map((dancer) => ({
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
    isRegistrationOpen: true,
  });

  return eligibility.canEdit ? null : eligibility.reasonText;
}

function haveSameIds(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);

  return right.every((id) => leftSet.has(id));
}

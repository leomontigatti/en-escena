import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographyDancers, choreographyProfessors } from "@/db/schema";
import {
  resolveChoreographyDancers,
  updateChoreographyDancers,
} from "@/lib/portal/choreography-roster-dancer-update.server";
import {
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
} from "@/lib/portal/choreography-roster-options.server";
import {
  updateChoreographyProfessors,
  validateChoreographyProfessorSelection,
} from "@/lib/portal/choreography-roster-professor-update.server";
import type { UpdateChoreographyResult } from "@/lib/portal/choreography-roster.shared";

export {
  getDancerEditingEligibility,
  type ChoreographyCategoryCalculationMode,
  type ChoreographyDancerOption,
  type ChoreographyDancerScheduleOption,
  type ChoreographyDancerScheduleResolution,
  type ChoreographyProfessorOption,
  type DancerEditingBlockReason,
  type DancerEditingEligibility,
  type ResolveChoreographyDancersResult,
  type UpdateChoreographyDancersResult,
  type UpdateChoreographyProfessorsResult,
  type UpdateChoreographyResult,
} from "@/lib/portal/choreography-roster.shared";
export {
  resolveChoreographyDancers,
  updateChoreographyDancers,
} from "@/lib/portal/choreography-roster-dancer-update.server";
export {
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
} from "@/lib/portal/choreography-roster-options.server";
export { updateChoreographyProfessors } from "@/lib/portal/choreography-roster-professor-update.server";

export async function updateChoreography(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  dancerIds: string[];
  professorIds: string[];
  experienceLevelId: string | null;
  scheduleCapacityId?: string | null;
  isRegistrationOpen: boolean;
}): Promise<UpdateChoreographyResult> {
  const [currentDancerLinks, currentProfessorLinks] = await Promise.all([
    db
      .select({ dancerId: choreographyDancers.dancerId })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.choreographyId, input.choreographyId)),
    db
      .select({ professorId: choreographyProfessors.professorId })
      .from(choreographyProfessors)
      .where(eq(choreographyProfessors.choreographyId, input.choreographyId)),
  ]);
  const dancerIdsChanged = !haveSameIds(
    currentDancerLinks.map((row) => row.dancerId),
    input.dancerIds,
  );
  const professorIdsChanged = !haveSameIds(
    currentProfessorLinks.map((row) => row.professorId),
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
    const dancerResult = await updateChoreographyDancers({
      academyId: input.academyId,
      choreographyId: input.choreographyId,
      dancerIds: input.dancerIds,
      eventId: input.eventId,
      experienceLevelId: input.experienceLevelId,
      isRegistrationOpen: input.isRegistrationOpen,
      scheduleCapacityId: input.scheduleCapacityId,
    });

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

function haveSameIds(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);

  return right.every((id) => leftSet.has(id));
}

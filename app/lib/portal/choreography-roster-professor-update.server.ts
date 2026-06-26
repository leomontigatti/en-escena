import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyProfessors,
  professors,
} from "@/db/schema";
import {
  choreographyNotFoundMessage,
  invalidProfessorSelectionMessage,
  type UpdateChoreographyProfessorsResult,
} from "@/lib/portal/choreography-roster.shared";

export async function updateChoreographyProfessors(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  professorIds: string[];
}): Promise<UpdateChoreographyProfessorsResult> {
  const choreography = await db.query.choreographies.findFirst({
    columns: { id: true },
    where: and(
      eq(choreographies.id, input.choreographyId),
      eq(choreographies.academyId, input.academyId),
      eq(choreographies.eventId, input.eventId),
    ),
  });

  if (!choreography) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const validation = await validateChoreographyProfessorSelection({
    academyId: input.academyId,
    choreographyId: input.choreographyId,
    professorIds: input.professorIds,
  });

  if (!validation.ok) {
    return validation;
  }

  const requestedProfessorIdsSet = new Set(validation.professorIds);
  const currentLinks = await db
    .select({
      professorId: choreographyProfessors.professorId,
    })
    .from(choreographyProfessors)
    .where(eq(choreographyProfessors.choreographyId, input.choreographyId));
  const linkedProfessorIds = new Set(
    currentLinks.map((row) => row.professorId),
  );
  const professorIdsToRemove = currentLinks
    .map((row) => row.professorId)
    .filter((id) => !requestedProfessorIdsSet.has(id));
  const professorIdsToAdd = validation.professorIds.filter(
    (id) => !linkedProfessorIds.has(id),
  );

  await db.transaction(async (tx) => {
    if (professorIdsToRemove.length > 0) {
      await tx
        .delete(choreographyProfessors)
        .where(
          and(
            eq(choreographyProfessors.choreographyId, input.choreographyId),
            inArray(choreographyProfessors.professorId, professorIdsToRemove),
          ),
        );
    }

    if (professorIdsToAdd.length > 0) {
      await tx.insert(choreographyProfessors).values(
        professorIdsToAdd.map((professorId) => ({
          choreographyId: input.choreographyId,
          professorId,
        })),
      );
    }
  });

  return { ok: true };
}

export async function validateChoreographyProfessorSelection(input: {
  academyId: string;
  choreographyId: string;
  professorIds: string[];
}): Promise<
  { ok: true; professorIds: string[] } | { ok: false; message: string }
> {
  const requestedProfessorIds = [...new Set(input.professorIds)];

  if (requestedProfessorIds.length === 0) {
    return { ok: true, professorIds: requestedProfessorIds };
  }

  const currentLinks = await db
    .select({
      professorId: choreographyProfessors.professorId,
    })
    .from(choreographyProfessors)
    .where(eq(choreographyProfessors.choreographyId, input.choreographyId));
  const linkedProfessorIds = new Set(
    currentLinks.map((row) => row.professorId),
  );
  const selectedProfessors = await db.query.professors.findMany({
    columns: { id: true, active: true },
    where: and(
      eq(professors.academyId, input.academyId),
      inArray(professors.id, requestedProfessorIds),
    ),
  });
  const allowedProfessorIds = new Set(
    selectedProfessors
      .filter(
        (professor) => professor.active || linkedProfessorIds.has(professor.id),
      )
      .map((professor) => professor.id),
  );

  if (
    selectedProfessors.length !== requestedProfessorIds.length ||
    requestedProfessorIds.some((id) => !allowedProfessorIds.has(id))
  ) {
    return {
      ok: false,
      message: invalidProfessorSelectionMessage,
    };
  }

  return { ok: true, professorIds: requestedProfessorIds };
}

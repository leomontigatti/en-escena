import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  events,
} from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";
import type { RosterPersonKind } from "@/lib/roster/roster-person-status.shared";

/**
 * Whether a roster person holds a live commitment in the **active** event.
 */
export async function findActiveEventParticipation(input: {
  kind: RosterPersonKind;
  personId: string;
}): Promise<boolean> {
  const activeEvent = await db.query.events.findFirst({
    columns: { id: true },
    where: eq(events.active, true),
  });

  if (!activeEvent) {
    return false;
  }

  const onChoreography =
    input.kind === "dancer"
      ? await findDancerChoreographyLink(activeEvent.id, input.personId)
      : await findProfessorChoreographyLink(activeEvent.id, input.personId);

  return onChoreography;
}

async function findDancerChoreographyLink(eventId: string, dancerId: string) {
  const [link] = await db
    .select({ id: choreographyDancers.id })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .where(
      and(
        eq(choreographyDancers.dancerId, dancerId),
        eq(choreographies.eventId, eventId),
        activeInscription(),
        notWithdrawnChoreography(),
      ),
    )
    .limit(1);

  return link !== undefined;
}

async function findProfessorChoreographyLink(
  eventId: string,
  professorId: string,
) {
  const [link] = await db
    .select({ choreographyId: choreographyProfessors.choreographyId })
    .from(choreographyProfessors)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyProfessors.choreographyId),
    )
    .where(
      and(
        eq(choreographyProfessors.professorId, professorId),
        eq(choreographies.eventId, eventId),
        notWithdrawnChoreography(),
      ),
    )
    .limit(1);

  return link !== undefined;
}

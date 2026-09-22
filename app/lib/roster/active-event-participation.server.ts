import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  events,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";
import { activeSeminarInscription } from "@/lib/seminars/active-inscription";

import type { RosterPersonKind } from "@/lib/roster/roster-person-status.shared";

/**
 * Whether a roster person —of either kind— holds a live commitment in the
 * **active** event: a non-withdrawn inscription on a choreography that is
 * itself not withdrawn, a professor link on such a choreography, or a
 * non-withdrawn seminar inscription of the event. It is the one place that
 * predicate is written, so the guard that refuses an archive and the screen
 * that greys the button out cannot drift apart.
 *
 * It resolves the active event itself and takes **no** selected event: the
 * panel's picker can be pointed at a past event, while the rule is about a
 * commitment that is live now. With no active event nothing is live, so
 * nothing is protected and the answer is `false`.
 *
 * Both withdrawal axes exclude. A person whose commitments are all withdrawn
 * is not participating: the rows survive to hold their money and their
 * comprobante line, not to claim the person is still in the event.
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

  if (onChoreography) {
    return true;
  }

  return await findSeminarInscription(activeEvent.id, input);
}

/**
 * Both axes, on purpose. Withdrawing a choreography stamps every inscription
 * still active along with it, so `activeInscription()` answers `false` for its
 * dancers on its own — but a row stamped on only one of the two must never
 * read as a live commitment, and the second condition costs nothing to state.
 */
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

/**
 * The professor side has a single axis: `choreography_professor` is a plain
 * many-to-many with no withdrawal of its own —removal is a physical delete— so
 * the choreography's own withdrawal is all there is to check.
 */
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

/**
 * Seminars count for both kinds, and the two person keys live on the same
 * table, so this one is written once with the column chosen by kind rather
 * than twice.
 */
async function findSeminarInscription(
  eventId: string,
  person: { kind: RosterPersonKind; personId: string },
) {
  const personColumn =
    person.kind === "dancer"
      ? seminarInscriptions.dancerId
      : seminarInscriptions.professorId;
  const [inscription] = await db
    .select({ id: seminarInscriptions.id })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .where(
      and(
        eq(personColumn, person.personId),
        eq(seminars.eventId, eventId),
        activeSeminarInscription(),
      ),
    )
    .limit(1);

  return inscription !== undefined;
}

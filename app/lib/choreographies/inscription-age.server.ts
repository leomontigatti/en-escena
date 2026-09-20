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
  getAgeAtDate,
  getEventLocalDateParts,
} from "@/lib/choreographies/registration-resolution.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Transaction | typeof db;

/**
 * Writes a freshly derived `ageAtEventStart` onto the inscriptions that are on
 * the roster. Insertion and revival already store the age they computed; this
 * is the same write for the rows a save keeps, so that no active inscription
 * survives a save carrying an age the choreography's own placement no longer
 * agrees with.
 *
 * Withdrawn inscriptions are out of scope on purpose (`activeInscription()`):
 * their stored age is the record of what that dancer competed with, not a
 * value to keep current.
 *
 * The ages arrive already computed, grouped into one update per distinct age
 * rather than one per row: a roster spans far fewer ages than dancers.
 */
export async function refreshActiveInscriptionAges(
  executor: Executor,
  input: {
    choreographyId: string;
    ageByDancerId: Map<string, number>;
  },
): Promise<void> {
  const dancerIdsByAge = new Map<number, string[]>();

  for (const [dancerId, age] of input.ageByDancerId) {
    dancerIdsByAge.set(age, [...(dancerIdsByAge.get(age) ?? []), dancerId]);
  }

  for (const [age, dancerIds] of dancerIdsByAge) {
    await executor
      .update(choreographyDancers)
      .set({ ageAtEventStart: age })
      .where(
        and(
          eq(choreographyDancers.choreographyId, input.choreographyId),
          inArray(choreographyDancers.dancerId, dancerIds),
          activeInscription(),
        ),
      );
  }
}

/**
 * The same refresh for a save that never resolves the roster —a rename, or a
 * professors-only edit— and therefore has no computed ages in hand. It derives
 * them here, from the dancers' birth dates against the start of the
 * choreography's own event, and touches nothing else: the placement a save like
 * that leaves on the choreography is not this function's business.
 *
 * One read: the event is reached through the choreography rather than taken
 * from the caller, so there is no second lookup and no way to normalize against
 * the wrong event's start date.
 */
export async function normalizeActiveInscriptionAges(input: {
  choreographyId: string;
}): Promise<void> {
  const links = await db
    .select({
      birthDate: dancers.birthDate,
      dancerId: choreographyDancers.dancerId,
      eventStartsAt: events.startsAt,
    })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(dancers.id, choreographyDancers.dancerId))
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .innerJoin(events, eq(events.id, choreographies.eventId))
    .where(
      and(
        eq(choreographyDancers.choreographyId, input.choreographyId),
        activeInscription(),
      ),
    );

  await refreshActiveInscriptionAges(db, {
    choreographyId: input.choreographyId,
    ageByDancerId: new Map(
      links.map((link) => [
        link.dancerId,
        getAgeAtDate(
          link.birthDate,
          getEventLocalDateParts(link.eventStartsAt),
        ),
      ]),
    ),
  });
}

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { choreographyDancers, dancers, events } from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { invalidDancerSelectionMessage } from "@/lib/choreographies/choreography-roster.shared";
import {
  getAgeAtDate,
  getEventLocalDateParts,
  type ResolvedRegistrationDancer,
} from "@/lib/choreographies/registration-resolution.server";
import {
  isSelectableForRoster,
  toRosterPersonStatus,
} from "@/lib/roster/roster-person-status.shared";

/**
 * The dancers an administrative roster names, each with the age it is placed
 * with, or the reason the selection is refused: a dancer of another academy,
 * or an inactive one that was not already on the roster. It reads the choice
 * and nothing about the choreography's classification, so the detail's draft
 * resolves the same people whatever modality it classifies them under.
 */
export async function readRosterDancers(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  dancerIds: string[];
}): Promise<
  | { ok: true; dancers: ResolvedRegistrationDancer[] }
  | { ok: false; message: string }
> {
  const requestedDancerIds = [...new Set(input.dancerIds)];
  // Only the active ones count as "already on the roster": that exception exists
  // so an inactive dancer who already appears is not blocked, and a withdrawn
  // inscription does not appear.
  const currentLinks = await db
    .select({
      dancerId: choreographyDancers.dancerId,
    })
    .from(choreographyDancers)
    .where(
      and(
        eq(choreographyDancers.choreographyId, input.choreographyId),
        activeInscription(),
      ),
    );
  const linkedDancerIds = new Set(currentLinks.map((row) => row.dancerId));

  const selectedDancers =
    requestedDancerIds.length > 0
      ? await db.query.dancers.findMany({
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            active: true,
          },
          where: and(
            eq(dancers.academyId, input.academyId),
            inArray(dancers.id, requestedDancerIds),
          ),
        })
      : [];

  const allowedDancerIds = new Set(
    selectedDancers
      .filter((dancer) =>
        isSelectableForRoster({
          status: toRosterPersonStatus(dancer.active),
          isAlreadyLinked: linkedDancerIds.has(dancer.id),
        }),
      )
      .map((dancer) => dancer.id),
  );

  if (
    selectedDancers.length !== requestedDancerIds.length ||
    requestedDancerIds.some((id) => !allowedDancerIds.has(id))
  ) {
    return {
      ok: false,
      message: invalidDancerSelectionMessage,
    };
  }

  const event = await db.query.events.findFirst({
    columns: { startsAt: true },
    where: eq(events.id, input.eventId),
  });

  if (!event) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const eventLocalStartDate = getEventLocalDateParts(event.startsAt);
  const selectedDancerById = new Map(
    selectedDancers.map((dancer) => [dancer.id, dancer]),
  );
  const resolvedDancers = requestedDancerIds.map((dancerId) => {
    const dancer = selectedDancerById.get(dancerId);

    if (!dancer) {
      throw new Error("Expected selected dancer to exist after validation.");
    }

    return {
      id: dancer.id,
      firstName: dancer.firstName,
      lastName: dancer.lastName,
      ageAtEventStart: getAgeAtDate(dancer.birthDate, eventLocalStartDate),
    } satisfies ResolvedRegistrationDancer;
  });

  return { ok: true, dancers: resolvedDancers };
}

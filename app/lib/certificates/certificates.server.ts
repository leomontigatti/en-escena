import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  dancers,
  events,
} from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import type { Award } from "@/lib/judging/award";
import {
  readPresentationResults,
  type AcademyAudience,
  type IndividualAudience,
} from "@/lib/judging/presentation-results.server";

import {
  certificateTemplateForEvent,
  type CertificateTemplate,
} from "./templates.server";

/**
 * Who a choreography's `certificate`s go to. A choreography has them when the
 * reader's audience reads a scored result for it (published, not withdrawn,
 * not disqualified, and the academy's own for an academy), when its event's
 * year has a template, and while a dancer is still inscribed. A scored result
 * always has an award, so there is a single sentence. They go to the dancers
 * still inscribed, named as the roster names them. Which of them a reader may
 * download is the surfaces' to decide: this only says what exists.
 */

export type CertificateRecipient = { dancerId: string; name: string };

export type ChoreographyCertificates = {
  award: Award;
  choreographyName: string;
  eventId: string;
  /** In the order the academy reads them: by last name, then first name. */
  recipients: CertificateRecipient[];
  template: CertificateTemplate;
};

export async function readChoreographyCertificates(
  audience: AcademyAudience | IndividualAudience,
  choreographyId: string,
): Promise<ChoreographyCertificates | null> {
  const result = (
    await readPresentationResults(audience, [choreographyId])
  ).get(choreographyId)?.result;

  if (result?.kind !== "scored") {
    return null;
  }

  const [choreography] = await db
    .select({
      eventId: choreographies.eventId,
      eventStartsAt: events.startsAt,
      name: choreographies.name,
    })
    .from(choreographies)
    .innerJoin(events, eq(events.id, choreographies.eventId))
    .where(eq(choreographies.id, choreographyId));
  const template = certificateTemplateForEvent(choreography.eventStartsAt);

  if (!template) {
    return null;
  }

  const recipients = await db
    .select({
      dancerId: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
    })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(dancers.id, choreographyDancers.dancerId))
    .where(
      and(
        eq(choreographyDancers.choreographyId, choreographyId),
        activeInscription(),
      ),
    )
    .orderBy(asc(dancers.lastName), asc(dancers.firstName));

  // A choreography nobody is inscribed in any more has nothing to offer.
  if (recipients.length === 0) {
    return null;
  }

  return {
    award: result.award,
    choreographyName: choreography.name,
    eventId: choreography.eventId,
    recipients: recipients.map((dancer) => ({
      dancerId: dancer.dancerId,
      name: `${dancer.firstName} ${dancer.lastName}`,
    })),
    template,
  };
}

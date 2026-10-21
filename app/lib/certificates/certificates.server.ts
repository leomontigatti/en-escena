import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  dancers,
  events,
} from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";
import type { Award } from "@/lib/judging/award";
import { readPresentationResults } from "@/lib/judging/presentation-results.server";
import { isPresentationResultPublished } from "@/lib/judging/results.server";

import {
  certificateTemplateForEvent,
  type CertificateTemplate,
} from "./templates.server";

/**
 * Who a choreography's `certificate`s go to. A choreography has them once its
 * result is published, behind the academies' own gate, when it took an award
 * and its event's year has a template, and while a dancer is still inscribed.
 * Every published presentation that is not disqualified has an award, so
 * there is a single sentence. They go to the dancers still inscribed, named as
 * the roster names them. Who may download
 * which is the surfaces' to decide: this only says what exists.
 */

export type CertificateRecipient = { dancerId: string; name: string };

export type ChoreographyCertificates = {
  academyId: string;
  award: Award;
  choreographyName: string;
  eventId: string;
  /** In the order the academy reads them: by last name, then first name. */
  recipients: CertificateRecipient[];
  template: CertificateTemplate;
};

export async function readChoreographyCertificates(
  choreographyId: string,
): Promise<ChoreographyCertificates | null> {
  const [choreography] = await db
    .select({
      academyId: choreographies.academyId,
      eventId: choreographies.eventId,
      eventStartsAt: events.startsAt,
      name: choreographies.name,
    })
    .from(choreographies)
    .innerJoin(events, eq(events.id, choreographies.eventId))
    .where(
      and(eq(choreographies.id, choreographyId), notWithdrawnChoreography()),
    );

  if (!choreography) {
    return null;
  }

  const template = certificateTemplateForEvent(choreography.eventStartsAt);

  if (!template || !(await isPresentationResultPublished(choreographyId))) {
    return null;
  }

  const award = (await readPresentationResults([choreographyId])).get(
    choreographyId,
  )?.award;

  if (!award) {
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
    academyId: choreography.academyId,
    award,
    choreographyName: choreography.name,
    eventId: choreography.eventId,
    recipients: recipients.map((dancer) => ({
      dancerId: dancer.dancerId,
      name: `${dancer.firstName} ${dancer.lastName}`,
    })),
    template,
  };
}

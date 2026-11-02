/**
 * The price rows a seminar inscription's money dialog reads, wherever it is
 * mounted (the `(seminar, academy)` financial detail, the event-wide seminar
 * inscriptions list), and the scope a money form resolves to. The gestures
 * themselves live in `inscription-money.server.ts`.
 *
 * **The candidate set is per person, not per seminar.** The participant cell is
 * read on the roster row the inscription names, so two inscriptions of the same
 * seminar can be offered different rows. That is why the options reader answers
 * a map keyed by inscription rather than one list.
 */

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { seminarInscriptions, seminarPrices, seminars } from "@/db/schema";
import { calculateDepositAmount } from "@/lib/finances/inscription-financial-status";
import type { InscriptionPriceOption } from "@/lib/finances/inscription-price";
import { selectSeminarPriceCandidates } from "@/lib/finances/seminar-inscription-price";
import {
  isParticipating,
  readSeminarParticipation,
} from "@/lib/finances/seminar-participation.server";
import { seminarInscriptionPerson } from "@/lib/seminars/inscription-person.server";

/**
 * What the money dialog offers each inscription of one seminar — or of every
 * seminar of the event when none is named: the rows **already filtered** to
 * the seminar's kind (with its `regular` fallback) and to the person's
 * participant cell. Offering a foreign row would be offering to create a state
 * the model forbids, so the rows are filtered rather than labelled.
 *
 * `paymentDeadline` is deliberately not a filter, exactly as on the choreography
 * side: the deadline decides which row applies when nobody has said, and here
 * somebody is saying it.
 */
export async function readSeminarInscriptionPriceOptions(input: {
  eventId: string;
  seminarId?: string;
}): Promise<Map<string, InscriptionPriceOption[]>> {
  const options = new Map<string, InscriptionPriceOption[]>();
  const seminarRows = await db
    .select({
      id: seminars.id,
      kind: seminars.kind,
      requiredDepositPercentage: seminars.requiredDepositPercentage,
    })
    .from(seminars)
    .where(
      and(
        eq(seminars.eventId, input.eventId),
        input.seminarId === undefined
          ? undefined
          : eq(seminars.id, input.seminarId),
      ),
    );

  if (seminarRows.length === 0) {
    return options;
  }

  const seminarsById = new Map(seminarRows.map((row) => [row.id, row]));
  const [priceRows, inscriptionRows] = await Promise.all([
    db.query.seminarPrices.findMany({
      where: eq(seminarPrices.eventId, input.eventId),
    }),
    db
      .select({
        dancerId: seminarInscriptions.dancerId,
        id: seminarInscriptions.id,
        individualId: seminarInscriptions.individualId,
        professorId: seminarInscriptions.professorId,
        seminarId: seminarInscriptions.seminarId,
      })
      .from(seminarInscriptions)
      .where(inArray(seminarInscriptions.seminarId, [...seminarsById.keys()])),
  ]);
  const participation = await readSeminarParticipation(db, {
    eventId: input.eventId,
    rows: inscriptionRows,
  });

  for (const inscription of inscriptionRows) {
    const seminar = seminarsById.get(inscription.seminarId);

    if (!seminar) {
      continue;
    }

    options.set(
      inscription.id,
      selectSeminarPriceCandidates({
        forParticipants: isParticipating(inscription, participation),
        priceRows,
        seminarKind: seminar.kind,
      })
        .map((price) => ({
          amount: price.amount,
          depositAmount: calculateDepositAmount({
            priceAmount: price.amount,
            requiredDepositPercentage: seminar.requiredDepositPercentage,
          }),
          id: price.id,
          name: price.name,
        }))
        .sort((left, right) => left.amount - right.amount),
    );
  }

  return options;
}

/**
 * The academy and the seminar a seminar inscription belongs to in the event,
 * read off the inscription itself so a money form only has to name it. The
 * academy is read **through the person**, as everywhere else on this side.
 * `null` when the inscription is not one of the event's.
 *
 * The writers check the academy again inside their transaction: this read says
 * where the money goes, and that check is what keeps it there.
 */
export async function readSeminarInscriptionMoneyTarget(input: {
  eventId: string;
  inscriptionId: string;
}): Promise<{
  academyId: string;
  eventId: string;
  inscriptionId: string;
  seminarId: string;
} | null> {
  const [target] = await db
    .select({
      academyId: seminarInscriptionPerson.academyId,
      seminarId: seminarInscriptions.seminarId,
    })
    .from(seminarInscriptions)
    .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
    .innerJoin(
      seminarInscriptionPerson,
      eq(seminarInscriptionPerson.inscriptionId, seminarInscriptions.id),
    )
    .where(
      and(
        eq(seminarInscriptions.id, input.inscriptionId),
        eq(seminars.eventId, input.eventId),
      ),
    )
    .limit(1);

  if (!target?.academyId) {
    return null;
  }

  return {
    academyId: target.academyId,
    eventId: input.eventId,
    inscriptionId: input.inscriptionId,
    seminarId: target.seminarId,
  };
}

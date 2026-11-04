/**
 * The price rows a seminar inscription's money dialog reads, wherever it is
 * mounted (the `(seminar, academy)` financial detail, the event-wide seminar
 * inscriptions list). The gestures themselves live in
 * `inscription-money.server.ts`.
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

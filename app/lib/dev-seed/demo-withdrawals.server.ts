import { format } from "date-fns/format";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { expectOk } from "@/lib/dev-seed/expect-ok";
import { choreographies, choreographyDancers } from "@/db/schema";
import { registerAcademyEventPayment } from "@/features/admin/finances/academy-choreographies/payments.server";
import { allocateToSeminarInscription } from "@/lib/finances/seminar-inscription-allocation.server";
import { createSeminarPrice } from "@/lib/seminar-prices/repository.server";
import {
  registerSeminarInscription,
  removeSeminarInscription,
} from "@/lib/seminars/inscriptions.server";
import { createSeminar } from "@/lib/seminars/repository.server";

// The dev seed's withdrawals beyond `Marea Alta` (#1065): a choreography row
// withdrawn the old way, and the seminar side.

/**
 * A withdrawn row holding more than its deposit: it keeps all 10000, 2500
 * above its 7500 deposit, the state the withdrawn row's dialog names as
 * `de más` (a row reaches it when its deposit moves down after the
 * withdrawal). Stamped directly, the way a row was withdrawn before #1065,
 * because no path withdraws like that any more.
 */
export async function stampLegacyWithdrawal(choreographyId: string, now: Date) {
  await db
    .update(choreographies)
    .set({ withdrawnAt: now })
    .where(eq(choreographies.id, choreographyId));
  await db
    .update(choreographyDancers)
    .set({ withdrawnAt: now })
    .where(eq(choreographyDancers.choreographyId, choreographyId));
}

/**
 * One seminar with two inscriptions on the participant price (20000, deposit
 * 10000 at 50%): Ana's paid in full and then removed by administration, which
 * withdraws it and releases what it held above its deposit, and Bea's with its
 * deposit covered and still active, for the removal confirmations.
 */
export async function seedSeminarWithdrawal(input: {
  academyId: string;
  eventId: string;
  now: Date;
  roster: { ana: string; bea: string };
  scheduledDate: string;
}) {
  const seminar = expectOk(
    await createSeminar(input.eventId, {
      instructorName: "Mora Quiroga",
      kind: "regular",
      quota: 10,
      requiredDepositPercentage: 50,
      scheduledDate: input.scheduledDate,
      startTime: "18:30",
    }),
    "create the seminar",
  ).seminar;
  let participantPriceId = "";
  for (const forParticipants of [true, false]) {
    const price = expectOk(
      await createSeminarPrice(input.eventId, {
        amount: forParticipants ? 20000 : 30000,
        forParticipants,
        kind: "regular",
        name: forParticipants ? "Participantes" : "No participantes",
        paymentDeadline: null,
      }),
      "create a seminar price",
    );
    if (forParticipants) {
      participantPriceId = price.record.id;
    }
  }

  await registerAcademyEventPayment({
    academyId: input.academyId,
    amount: 30000,
    eventId: input.eventId,
    internalNote: null,
    paymentDate: format(input.now, "yyyy-MM-dd"),
    paymentMethod: "transferencia",
    reference: null,
  });

  const inscriptionIds: string[] = [];
  for (const [personId, amount] of [
    [input.roster.ana, 20000],
    [input.roster.bea, 10000],
  ] as const) {
    const { inscriptionId } = expectOk(
      await registerSeminarInscription({
        academyId: input.academyId,
        eventId: input.eventId,
        now: input.now,
        personId,
        personKind: "dancer",
        seminarId: seminar.id,
      }),
      "register a seminar inscription",
    );
    expectOk(
      await allocateToSeminarInscription({
        now: new Date(),
        academyId: input.academyId,
        amount,
        eventId: input.eventId,
        inscriptionId,
        priceId: participantPriceId,
        seminarId: seminar.id,
      }),
      "allocate to a seminar inscription",
    );
    inscriptionIds.push(inscriptionId);
  }

  expectOk(
    await removeSeminarInscription({
      inscriptionId: inscriptionIds[0],
      seminarId: seminar.id,
    }),
    "withdraw a seminar inscription",
  );
}

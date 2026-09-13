import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  payments,
  seminarInscriptions,
  seminarPrices,
  seminars,
} from "@/db/schema";
import { createDancer } from "@/lib/choreographies/registration-test-fixtures.server.db";
import {
  allocateToSeminarInscription,
  readSeminarInscriptionPriceOptions,
  releaseSeminarInscriptionExcess,
  removeFromSeminarInscription,
} from "@/lib/finances/seminar-inscription-allocation.server";
import { readSeminarInscriptionThresholds } from "@/lib/finances/seminar-inscription-thresholds.server";
import { hasCoveredSeminarInscription } from "@/lib/seminars/covered-inscriptions.server";
import { updateSeminar } from "@/lib/seminars/repository.server";
import { createAcademyUser } from "@/lib/test-support/academies";

import { installDatabaseTestHooks } from "../../../tests/db/harness";
import {
  createAcademyFinanceChoreographyFixture,
  createSavedEvent,
} from "../admin/finances/finances.test-support";

installDatabaseTestHooks();

const amounts = {
  regularOutsider: 30000,
  regularParticipant: 20000,
  specialOutsider: 50000,
  specialParticipant: 40000,
};

/**
 * An `Exclusivo` seminar at its own 50 % rate inside an event that collects
 * 30 %, a full four-cell price list, a participant and an outsider, and a
 * payment big enough to fund either of them twice over.
 */
async function seedFixture() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const dancing = await createAcademyFinanceChoreographyFixture({
    academyName: "Academia Bailando",
    choreographyName: "Aire",
    email: `bailando.${crypto.randomUUID()}@example.com`,
    event,
  });
  const watching = await createAcademyUser({
    academyName: "Academia Mirando",
    email: `mirando.${crypto.randomUUID()}@example.com`,
  });
  const academyId = dancing.academy.academy.id;

  const participant = await createDancer(academyId, {
    firstName: "Ana",
    lastName: "Bailando",
  });
  const outsider = await createDancer(watching.academyId, {
    firstName: "Ana",
    lastName: "Mirando",
  });

  await db.insert(choreographyDancers).values({
    ageAtEventStart: 14,
    choreographyId: dancing.choreography.id,
    dancerId: participant.id,
  });

  const [seminar] = await db
    .insert(seminars)
    .values({
      eventId: event.id,
      instructorName: "Abril Sosa",
      kind: "special",
      quota: 20,
      requiredDepositPercentage: 50,
      scheduledDate: "2030-10-10",
      startTime: "18:30",
    })
    .returning();

  const priceIds = new Map<keyof typeof amounts, string>();
  for (const [cell, amount] of Object.entries(amounts)) {
    const [row] = await db
      .insert(seminarPrices)
      .values({
        amount,
        eventId: event.id,
        forParticipants: cell.endsWith("Participant"),
        kind: cell.startsWith("special") ? "special" : "regular",
        name: `Precio ${cell}`,
        paymentDeadline: null,
      })
      .returning();

    priceIds.set(cell as keyof typeof amounts, row.id);
  }

  const [inscription] = await db
    .insert(seminarInscriptions)
    .values({ dancerId: participant.id, seminarId: seminar.id })
    .returning();
  const [outsiderInscription] = await db
    .insert(seminarInscriptions)
    .values({ dancerId: outsider.id, seminarId: seminar.id })
    .returning();

  await db.insert(payments).values({
    academyId,
    amount: 100000,
    eventId: event.id,
    paymentDate: "2030-04-01",
    paymentMethod: "transferencia",
    paymentNumber: 1,
  });

  return {
    academyId,
    eventId: event.id,
    inscriptionId: inscription.id,
    outsiderInscriptionId: outsiderInscription.id,
    priceIds,
    seminarId: seminar.id,
    watchingAcademyId: watching.academyId,
  };
}

type Fixture = Awaited<ReturnType<typeof seedFixture>>;

function allocate(
  fixture: Fixture,
  input: { amount: number; priceId: string | null },
) {
  return allocateToSeminarInscription({
    academyId: fixture.academyId,
    amount: input.amount,
    eventId: fixture.eventId,
    inscriptionId: fixture.inscriptionId,
    priceId: input.priceId,
    seminarId: fixture.seminarId,
  });
}

async function readSelectedPriceId(inscriptionId: string) {
  const thresholds = await db.query.seminarInscriptions.findFirst({
    columns: { selectedPriceId: true },
    where: eq(seminarInscriptions.id, inscriptionId),
  });

  return thresholds?.selectedPriceId ?? null;
}

describe.sequential("seminar inscription allocation", () => {
  test("offers each person only their own cell of the seminar's kind", async () => {
    const fixture = await seedFixture();

    const options = await readSeminarInscriptionPriceOptions({
      eventId: fixture.eventId,
      seminarId: fixture.seminarId,
    });

    // One row each, and the `Seña` is half of it: the seminar's 50 %, never the
    // event's 30 %.
    expect(options.get(fixture.inscriptionId)).toEqual([
      {
        amount: amounts.specialParticipant,
        depositAmount: amounts.specialParticipant / 2,
        id: fixture.priceIds.get("specialParticipant"),
        name: "Precio specialParticipant",
      },
    ]);
    expect(options.get(fixture.outsiderInscriptionId)).toEqual([
      {
        amount: amounts.specialOutsider,
        depositAmount: amounts.specialOutsider / 2,
        id: fixture.priceIds.get("specialOutsider"),
        name: "Precio specialOutsider",
      },
    ]);
  });

  test("falls back to the `Común` rows of the same cell when the kind has none", async () => {
    const fixture = await seedFixture();
    await db
      .delete(seminarPrices)
      .where(eq(seminarPrices.id, fixture.priceIds.get("specialParticipant")!));

    const options = await readSeminarInscriptionPriceOptions({
      eventId: fixture.eventId,
      seminarId: fixture.seminarId,
    });

    // Along the kind axis and never along the participant one.
    expect(options.get(fixture.inscriptionId)).toEqual([
      {
        amount: amounts.regularParticipant,
        depositAmount: amounts.regularParticipant / 2,
        id: fixture.priceIds.get("regularParticipant"),
        name: "Precio regularParticipant",
      },
    ]);
  });

  test("writes the chosen price and funds the row out of the academy's pool", async () => {
    const fixture = await seedFixture();

    const result = await allocate(fixture, {
      amount: 5000,
      priceId: fixture.priceIds.get("specialParticipant")!,
    });

    expect(result).toEqual({ ok: true });
    expect(await readSelectedPriceId(fixture.inscriptionId)).toBe(
      fixture.priceIds.get("specialParticipant"),
    );
    // Below the deposit the row holds its money and no place.
    expect(await hasCoveredSeminarInscription(fixture.seminarId)).toBe(false);
  });

  test("refuses a price row of another cell", async () => {
    const fixture = await seedFixture();

    const result = await allocate(fixture, {
      amount: 5000,
      priceId: fixture.priceIds.get("specialOutsider")!,
    });

    expect(result).toEqual({
      ok: false,
      message: "No encontramos esa fila de precio.",
    });
    expect(await readSelectedPriceId(fixture.inscriptionId)).toBeNull();
  });

  test("locks the price once the deposit is covered and opens it again when money leaves", async () => {
    const fixture = await seedFixture();
    // A second row of the same cell, which is what there has to be for a switch
    // to be refusable at all.
    const [lateRow] = await db
      .insert(seminarPrices)
      .values({
        amount: amounts.specialParticipant + 5000,
        eventId: fixture.eventId,
        forParticipants: true,
        kind: "special",
        name: "Precio tardío",
        paymentDeadline: "2030-09-01",
      })
      .returning();

    await allocate(fixture, {
      amount: amounts.specialParticipant / 2,
      priceId: fixture.priceIds.get("specialParticipant")!,
    });

    expect(await hasCoveredSeminarInscription(fixture.seminarId)).toBe(true);

    // A covered row freezes the seminar's kind and its own deposit rate, which
    // is the guard slice 1 left behind this predicate.
    await expect(
      updateSeminar(fixture.seminarId, {
        instructorName: "Abril Sosa",
        kind: "special",
        quota: 20,
        requiredDepositPercentage: 40,
        scheduledDate: "2030-10-10",
        startTime: "18:30",
      }),
    ).resolves.toMatchObject({ ok: false, code: "covered-inscriptions" });

    const refused = await allocate(fixture, {
      amount: 1000,
      priceId: lateRow.id,
    });

    expect(refused.ok).toBe(false);
    expect(await readSelectedPriceId(fixture.inscriptionId)).toBe(
      fixture.priceIds.get("specialParticipant"),
    );

    // Taking money off until the row falls back below its deposit is what opens
    // the picker again.
    await removeFromSeminarInscription({
      academyId: fixture.academyId,
      amount: 1,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
      seminarId: fixture.seminarId,
    });

    const accepted = await allocate(fixture, {
      amount: 1,
      priceId: lateRow.id,
    });

    expect(accepted).toEqual({ ok: true });
    expect(await readSelectedPriceId(fixture.inscriptionId)).toBe(lateRow.id);
  });

  test("refuses to move money onto an inscription of another academy", async () => {
    const fixture = await seedFixture();

    const result = await allocateToSeminarInscription({
      academyId: fixture.academyId,
      amount: 1000,
      eventId: fixture.eventId,
      inscriptionId: fixture.outsiderInscriptionId,
      priceId: fixture.priceIds.get("specialOutsider")!,
      seminarId: fixture.seminarId,
    });

    expect(result).toEqual({
      ok: false,
      message: "No encontramos esa inscripción.",
    });
  });

  test("releases exactly what the row holds above its total", async () => {
    const fixture = await seedFixture();
    await allocate(fixture, {
      amount: amounts.specialParticipant,
      priceId: fixture.priceIds.get("specialParticipant")!,
    });
    // Past the total, which the pool refuses to grow into: the excess is written
    // directly so the release has something to take off.
    await db
      .update(seminarPrices)
      .set({ amount: 30000 })
      .where(eq(seminarPrices.id, fixture.priceIds.get("specialParticipant")!));

    const released = await releaseSeminarInscriptionExcess({
      academyId: fixture.academyId,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionId,
      seminarId: fixture.seminarId,
    });

    expect(released).toEqual({ ok: true });

    const thresholds = await readSeminarInscriptionThresholds(db, {
      academyId: fixture.academyId,
      eventId: fixture.eventId,
      inscriptionIds: [fixture.inscriptionId],
    });

    expect(thresholds.get(fixture.inscriptionId)?.totalAmount).toBe(30000);
  });
});

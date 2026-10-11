import { eq, inArray } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  payments,
  seminarInscriptions,
  seminarPrices,
  seminars,
} from "@/db/schema";
import { createAcademyFinanceChoreographyFixture } from "@/lib/admin/finances/finances.test-support";
import { createDancer } from "@/lib/choreographies/registration.test-support";
import { createSavedEvent } from "@/lib/test-support/events";

import { installDatabaseTestHooks } from "../../../tests/db/harness";
import { allocateToSeminarInscription } from "./seminar-inscription-allocation.server";
import {
  applyCurrentSeminarPrices,
  assertSeminarPlacesForCrossings,
  lockSeminars,
} from "./seminar-money-support.server";

installDatabaseTestHooks();

/**
 * Two seminars of one event — an `Exclusivo` one and a `Regular` one — with a full four-cell price list, and one academy that holds a
 * participant and a non-participant in each.
 */
async function seedFixture() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const academy = await createAcademyFinanceChoreographyFixture({
    academyName: "Academia Bailando",
    choreographyName: "Aire",
    email: `bailando.${crypto.randomUUID()}@example.com`,
    event,
  });
  const academyId = academy.academy.academy.id;
  const participant = await createDancer(academyId, {
    firstName: "Ana",
    lastName: "Bailando",
  });
  const outsider = await createDancer(academyId, {
    firstName: "Bruno",
    lastName: "Mirando",
  });

  await db.insert(choreographyDancers).values({
    ageAtEventStart: 14,
    choreographyId: academy.choreography.id,
    dancerId: participant.id,
  });

  const [special, regular] = await db
    .insert(seminars)
    .values([
      {
        eventId: event.id,
        instructorName: "Abril Sosa",
        kind: "special" as const,
        quota: 20,
        requiredDepositPercentage: 50,
        scheduledDate: "2030-10-10",
        startTime: "18:30",
      },
      {
        eventId: event.id,
        instructorName: "Nicolás Prado",
        kind: "regular" as const,
        quota: 20,
        requiredDepositPercentage: 50,
        scheduledDate: "2030-10-11",
        startTime: "10:00",
      },
    ])
    .returning();

  const priceRows = await db
    .insert(seminarPrices)
    .values(
      (
        [
          ["regular", true, 20000],
          ["regular", false, 30000],
          ["special", true, 40000],
          ["special", false, 50000],
        ] as const
      ).map(([kind, forParticipants, amount]) => ({
        amount,
        eventId: event.id,
        forParticipants,
        kind,
        name: `${kind} ${forParticipants ? "participante" : "no participante"}`,
        paymentDeadline: null,
      })),
    )
    .returning();
  const priceId = (kind: "regular" | "special", forParticipants: boolean) =>
    priceRows.find(
      (row) => row.kind === kind && row.forParticipants === forParticipants,
    )!.id;

  const inscriptions = await db
    .insert(seminarInscriptions)
    .values([
      { dancerId: participant.id, seminarId: special!.id },
      { dancerId: outsider.id, seminarId: special!.id },
      { dancerId: participant.id, seminarId: regular!.id },
      { dancerId: outsider.id, seminarId: regular!.id },
    ])
    .returning();

  return {
    academyId,
    eventId: event.id,
    inscriptions,
    priceId,
    regular: regular!,
    special: special!,
  };
}

type Fixture = Awaited<ReturnType<typeof seedFixture>>;

async function readStoredPriceIds(inscriptionIds: string[]) {
  const rows = await db
    .select({
      id: seminarInscriptions.id,
      selectedPriceId: seminarInscriptions.selectedPriceId,
    })
    .from(seminarInscriptions)
    .where(inArray(seminarInscriptions.id, inscriptionIds));

  return new Map(rows.map((row) => [row.id, row.selectedPriceId]));
}

/** Prices the inscription and funds exactly its deposit through the money
 * dialog's own write, which is what takes a place. */
async function coverDeposit(
  fixture: Fixture,
  input: { amount: number; inscriptionId: string; priceId: string },
) {
  await db.insert(payments).values({
    academyId: fixture.academyId,
    amount: input.amount,
    eventId: fixture.eventId,
    paymentDate: "2030-04-01",
    paymentMethod: "transferencia",
    paymentNumber: 1,
  });

  const covered = await allocateToSeminarInscription({
    academyId: fixture.academyId,
    amount: input.amount,
    eventId: fixture.eventId,
    inscriptionId: input.inscriptionId,
    priceId: input.priceId,
    seminarId: fixture.special.id,
  });

  expect(covered).toEqual({ ok: true });
}

describe("lockSeminars", () => {
  test("answers every seminar asked for, once, and leaves out ids that do not exist", async () => {
    const fixture = await seedFixture();

    const locked = await db.transaction((tx) =>
      lockSeminars(tx, [
        fixture.special.id,
        fixture.regular.id,
        fixture.special.id,
        crypto.randomUUID(),
      ]),
    );

    expect(locked.map((seminar) => seminar.id)).toEqual(
      [fixture.special.id, fixture.regular.id].sort(),
    );
  });
});

describe("applyCurrentSeminarPrices", () => {
  test("prices each unpriced inscription from its seminar's kind and the person's cell", async () => {
    const fixture = await seedFixture();
    const [
      specialParticipant,
      specialOutsider,
      regularParticipant,
      regularOutsider,
    ] = fixture.inscriptions;

    const result = await db.transaction(async (tx) =>
      applyCurrentSeminarPrices(tx, {
        eventId: fixture.eventId,
        inscriptions: fixture.inscriptions,
        seminars: await lockSeminars(tx, [
          fixture.special.id,
          fixture.regular.id,
        ]),
      }),
    );

    expect(result).toEqual({ ok: true });
    expect(
      await readStoredPriceIds(fixture.inscriptions.map((row) => row.id)),
    ).toEqual(
      new Map([
        [specialParticipant!.id, fixture.priceId("special", true)],
        [specialOutsider!.id, fixture.priceId("special", false)],
        [regularParticipant!.id, fixture.priceId("regular", true)],
        [regularOutsider!.id, fixture.priceId("regular", false)],
      ]),
    );
  });

  test("leaves an inscription that already holds a price untouched", async () => {
    const fixture = await seedFixture();
    const specialOutsider = fixture.inscriptions[1]!;
    // A row somebody chose on purpose, even one today's resolution would not pick.
    const chosen = fixture.priceId("regular", false);

    await db
      .update(seminarInscriptions)
      .set({ selectedPriceId: chosen })
      .where(eq(seminarInscriptions.id, specialOutsider.id));
    const [stored] = await db
      .select()
      .from(seminarInscriptions)
      .where(eq(seminarInscriptions.id, specialOutsider.id));

    await db.transaction(async (tx) =>
      applyCurrentSeminarPrices(tx, {
        eventId: fixture.eventId,
        inscriptions: [stored!],
        seminars: await lockSeminars(tx, [fixture.special.id]),
      }),
    );

    expect(
      (await readStoredPriceIds([specialOutsider.id])).get(specialOutsider.id),
    ).toBe(chosen);
  });
});

describe("assertSeminarPlacesForCrossings", () => {
  test("lets the crossings through while every seminar has the places they need", async () => {
    const fixture = await seedFixture();

    const result = await db.transaction(async (tx) =>
      assertSeminarPlacesForCrossings(tx, {
        neededBySeminarId: new Map([
          [fixture.special.id, 2],
          [fixture.regular.id, 2],
        ]),
        seminars: await lockSeminars(tx, [
          fixture.special.id,
          fixture.regular.id,
        ]),
      }),
    );

    expect(result).toEqual({ ok: true });
  });

  test("refuses when covered plus needed exceeds the quota, naming the seminar and the shortfall", async () => {
    const fixture = await seedFixture();

    await coverDeposit(fixture, {
      amount: 20000,
      inscriptionId: fixture.inscriptions[0]!.id,
      priceId: fixture.priceId("special", true),
    });
    await db
      .update(seminars)
      .set({ quota: 1 })
      .where(inArray(seminars.id, [fixture.special.id, fixture.regular.id]));

    const result = await db.transaction(async (tx) =>
      assertSeminarPlacesForCrossings(tx, {
        neededBySeminarId: new Map([
          [fixture.special.id, 1],
          [fixture.regular.id, 1],
        ]),
        seminars: await lockSeminars(tx, [
          fixture.special.id,
          fixture.regular.id,
        ]),
      }),
    );

    expect(result).toEqual({
      ok: false,
      message:
        "No quedan lugares suficientes en el seminario de Abril Sosa del 10 de octubre de 2030: falta 1.",
    });
  });
});

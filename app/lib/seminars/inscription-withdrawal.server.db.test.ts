import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  dancers,
  payments,
  seminarInscriptions,
  seminarPrices,
} from "@/db/schema";
import { createDancer } from "@/lib/choreographies/registration-test-fixtures.server.db";
import { createSavedEvent } from "@/lib/admin/finances/finances.test-support";
import {
  allocateToSeminarInscription,
  removeFromSeminarInscription,
} from "@/lib/finances/seminar-inscription-allocation.server";
import {
  deleteSeminarInscriptionForAcademy,
  registerSeminarInscription,
  removeSeminarInscription,
  type RegisterSeminarInscriptionResult,
} from "@/lib/seminars/inscriptions.server";
import {
  listSeminarInscriptions,
  listSeminarInscriptionsForAcademy,
  listSeminarPersonOptionsForAcademy,
} from "@/lib/seminars/inscription-rosters.server";
import { countCoveredSeminarInscriptions } from "@/lib/seminars/covered-inscriptions.server";
import { createSeminar, deleteSeminar } from "@/lib/seminars/repository.server";
import { createAcademyUser } from "@/lib/test-support/academies";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

// One minute before and one minute after 2026-10-10 18:30 in business time.
const beforeStart = new Date("2026-10-10T21:29:00.000Z");
const afterStart = new Date("2026-10-10T21:31:00.000Z");

const priceAmount = 20000;
/** The seminar's own 50 %, which is the crossing every test here measures by. */
const depositAmount = priceAmount / 2;

/**
 * One seminar of one event with one deadline-less `Común` non-participant price
 * row, one academy with three dancers and a payment big enough to cover several
 * deposits. Nobody is participating in anything, so every inscription is priced
 * by the same row.
 */
async function seedFixture(quota = 2) {
  const event = await createSavedEvent({ name: "Regional 2026" });
  const { academy } = await createAcademyUser({
    academyName: "Academia Retiros",
    email: `retiros.${crypto.randomUUID()}@example.com`,
  });
  const seminar = await createSeminar(event.id, {
    instructorName: "Abril Sosa",
    kind: "regular",
    quota,
    requiredDepositPercentage: 50,
    scheduledDate: "2026-10-10",
    startTime: "18:30",
  });

  if (!seminar.ok) {
    throw new Error(`Expected the seminar to be saved: ${seminar.error}`);
  }

  const [price] = await db
    .insert(seminarPrices)
    .values({
      amount: priceAmount,
      eventId: event.id,
      forParticipants: false,
      kind: "regular",
      name: "General",
      paymentDeadline: null,
    })
    .returning();

  await db.insert(payments).values({
    academyId: academy.id,
    amount: 200000,
    eventId: event.id,
    paymentDate: "2026-04-01",
    paymentMethod: "transferencia",
    paymentNumber: 1,
  });

  const people = [];
  for (const firstName of ["Ana", "Bruno", "Celeste"]) {
    people.push(await createDancer(academy.id, { firstName, lastName: "Paz" }));
  }

  return {
    academyId: academy.id,
    eventId: event.id,
    people,
    priceId: price.id,
    seminarId: seminar.seminar.id,
  };
}

type Fixture = Awaited<ReturnType<typeof seedFixture>>;

function register(fixture: Fixture, personId: string, now = beforeStart) {
  return registerSeminarInscription({
    academyId: fixture.academyId,
    eventId: fixture.eventId,
    now,
    personId,
    personKind: "dancer",
    seminarId: fixture.seminarId,
  });
}

function expectRegistered(result: RegisterSeminarInscriptionResult) {
  if (!result.ok) {
    throw new Error(`Expected the inscription to be saved: ${result.error}`);
  }

  return result.inscriptionId;
}

async function allocate(
  fixture: Fixture,
  input: { amount: number; inscriptionId: string },
) {
  const result = await allocateToSeminarInscription({
    academyId: fixture.academyId,
    amount: input.amount,
    eventId: fixture.eventId,
    inscriptionId: input.inscriptionId,
    priceId: fixture.priceId,
    seminarId: fixture.seminarId,
  });

  if (!result.ok) {
    throw new Error(`Expected the allocation to land: ${result.message}`);
  }
}

/** Registers the person and covers their deposit, which is what takes a place. */
async function registerCovered(fixture: Fixture, personId: string) {
  const inscriptionId = expectRegistered(await register(fixture, personId));

  await allocate(fixture, { amount: depositAmount, inscriptionId });

  return inscriptionId;
}

function readInscription(inscriptionId: string) {
  return db.query.seminarInscriptions.findFirst({
    where: eq(seminarInscriptions.id, inscriptionId),
  });
}

describe("removing a seminar inscription", () => {
  test("deletes an unfunded row and withdraws a funded one, on the academy's side", async () => {
    const fixture = await seedFixture();
    const unfunded = expectRegistered(
      await register(fixture, fixture.people[0].id),
    );
    const funded = await registerCovered(fixture, fixture.people[1].id);
    const createdAt = (await readInscription(funded))?.createdAt;

    await expect(
      deleteSeminarInscriptionForAcademy({
        academyId: fixture.academyId,
        eventId: fixture.eventId,
        inscriptionId: unfunded,
        now: beforeStart,
      }),
    ).resolves.toEqual({ ok: true, withdrawn: false });
    await expect(
      deleteSeminarInscriptionForAcademy({
        academyId: fixture.academyId,
        eventId: fixture.eventId,
        inscriptionId: funded,
        now: beforeStart,
      }),
    ).resolves.toEqual({ ok: true, withdrawn: true });

    expect(await readInscription(unfunded)).toBeUndefined();

    // Everything the withdrawal is for: the money, the stored price row and the
    // date the inscription was made.
    const withdrawn = await readInscription(funded);
    expect(withdrawn?.withdrawnAt).toBeInstanceOf(Date);
    expect(withdrawn?.selectedPriceId).toBe(fixture.priceId);
    expect(withdrawn?.createdAt).toEqual(createdAt);
    await expect(
      db.query.paymentAllocations.findMany({
        where: (allocations, { eq: equals }) =>
          equals(allocations.seminarInscriptionId, funded),
      }),
    ).resolves.toMatchObject([{ amount: depositAmount }]);

    // Off the roster on both readings, and the place it held is free again.
    await expect(
      listSeminarInscriptionsForAcademy({
        academyId: fixture.academyId,
        eventId: fixture.eventId,
      }),
    ).resolves.toEqual([]);
    await expect(listSeminarInscriptions(fixture.seminarId)).resolves.toEqual(
      [],
    );
    await expect(
      countCoveredSeminarInscriptions(fixture.seminarId),
    ).resolves.toBe(0);
  });

  test("refuses the academy's removal once the seminar started and administration's does not", async () => {
    const fixture = await seedFixture();
    const inscriptionId = await registerCovered(fixture, fixture.people[0].id);

    await expect(
      deleteSeminarInscriptionForAcademy({
        academyId: fixture.academyId,
        eventId: fixture.eventId,
        inscriptionId,
        now: afterStart,
      }),
    ).resolves.toMatchObject({ ok: false, code: "started" });

    // Administration goes through the same chooser: a funded row is withdrawn
    // rather than deleted there too.
    await expect(
      removeSeminarInscription({ inscriptionId, seminarId: fixture.seminarId }),
    ).resolves.toEqual({ ok: true, withdrawn: true });
    expect((await readInscription(inscriptionId))?.withdrawnAt).toBeInstanceOf(
      Date,
    );
  });

  test("reports a row already withdrawn as missing on both sides", async () => {
    const fixture = await seedFixture();
    const inscriptionId = await registerCovered(fixture, fixture.people[0].id);

    await removeSeminarInscription({
      inscriptionId,
      seminarId: fixture.seminarId,
    });

    await expect(
      removeSeminarInscription({ inscriptionId, seminarId: fixture.seminarId }),
    ).resolves.toMatchObject({ ok: false, code: "inscription-not-found" });
    await expect(
      deleteSeminarInscriptionForAcademy({
        academyId: fixture.academyId,
        eventId: fixture.eventId,
        inscriptionId,
        now: beforeStart,
      }),
    ).resolves.toMatchObject({ ok: false, code: "inscription-not-found" });
  });

  test("flags the rows whose removal would withdraw them", async () => {
    const fixture = await seedFixture();
    expectRegistered(await register(fixture, fixture.people[0].id));
    await registerCovered(fixture, fixture.people[1].id);

    await expect(
      listSeminarInscriptions(fixture.seminarId),
    ).resolves.toMatchObject([
      { fullName: "Ana Paz", hasMoney: false },
      { fullName: "Bruno Paz", hasMoney: true },
    ]);
    await expect(
      listSeminarInscriptionsForAcademy({
        academyId: fixture.academyId,
        eventId: fixture.eventId,
      }),
    ).resolves.toMatchObject([
      { fullName: "Ana Paz", hasMoney: false },
      { fullName: "Bruno Paz", hasMoney: true },
    ]);
  });

  test("keeps a withdrawn row when its money is taken back to zero", async () => {
    const fixture = await seedFixture();
    const inscriptionId = await registerCovered(fixture, fixture.people[0].id);

    await removeSeminarInscription({
      inscriptionId,
      seminarId: fixture.seminarId,
    });
    await expect(
      removeFromSeminarInscription({
        academyId: fixture.academyId,
        amount: depositAmount,
        eventId: fixture.eventId,
        inscriptionId,
        seminarId: fixture.seminarId,
      }),
    ).resolves.toMatchObject({ ok: true });

    // The chooser decided once: de-allocation is not a deferred delete.
    expect((await readInscription(inscriptionId))?.withdrawnAt).toBeInstanceOf(
      Date,
    );
  });
});

describe("reviving a withdrawn seminar inscription", () => {
  test("brings the same row back with its money and its creation date", async () => {
    const fixture = await seedFixture();
    const inscriptionId = await registerCovered(fixture, fixture.people[0].id);
    const before = await readInscription(inscriptionId);

    await removeSeminarInscription({
      inscriptionId,
      seminarId: fixture.seminarId,
    });

    // The picker offers the person again: only active rows take somebody out of
    // it, and a withdrawn row is not one.
    await expect(
      listSeminarPersonOptionsForAcademy(fixture.academyId),
    ).resolves.toMatchObject([
      { fullName: "Ana Paz" },
      { fullName: "Bruno Paz" },
      { fullName: "Celeste Paz" },
    ]);

    await expect(
      register(fixture, fixture.people[0].id),
    ).resolves.toMatchObject({ ok: true, inscriptionId });

    const revived = await readInscription(inscriptionId);
    expect(revived?.withdrawnAt).toBeNull();
    expect(revived?.createdAt).toEqual(before?.createdAt);
    expect(revived?.selectedPriceId).toBe(fixture.priceId);
    await expect(
      countCoveredSeminarInscriptions(fixture.seminarId),
    ).resolves.toBe(1);
  });

  test("refuses the revival that would retake a place the seminar no longer has", async () => {
    const fixture = await seedFixture(1);
    const inscriptionId = await registerCovered(fixture, fixture.people[0].id);

    await removeSeminarInscription({
      inscriptionId,
      seminarId: fixture.seminarId,
    });
    // The freed place is taken by somebody else, so the withdrawn row has
    // nowhere to come back to.
    await registerCovered(fixture, fixture.people[1].id);

    await expect(
      register(fixture, fixture.people[0].id),
    ).resolves.toMatchObject({
      ok: false,
      code: "no-places",
      error: "Sin lugares disponibles.",
    });
    expect((await readInscription(inscriptionId))?.withdrawnAt).toBeInstanceOf(
      Date,
    );
  });

  test("revives a row holding money below its deposit even when the seminar is full", async () => {
    const fixture = await seedFixture(1);
    const partial = expectRegistered(
      await register(fixture, fixture.people[0].id),
    );
    await allocate(fixture, {
      amount: depositAmount - 1,
      inscriptionId: partial,
    });

    await removeSeminarInscription({
      inscriptionId: partial,
      seminarId: fixture.seminarId,
    });
    await registerCovered(fixture, fixture.people[1].id);

    await expect(
      register(fixture, fixture.people[0].id),
    ).resolves.toMatchObject({ ok: true, inscriptionId: partial });
  });

  test("refuses the revival after the seminar started and for an archived person", async () => {
    const fixture = await seedFixture();
    const inscriptionId = await registerCovered(fixture, fixture.people[0].id);

    await removeSeminarInscription({
      inscriptionId,
      seminarId: fixture.seminarId,
    });

    await expect(
      register(fixture, fixture.people[0].id, afterStart),
    ).resolves.toMatchObject({ ok: false, code: "started" });

    // The grandfather half of the roster rule keeps the inscriptions an archived
    // person already has; a withdrawn row is not one of them, so reviving it is
    // registering an archived person.
    await db
      .update(dancers)
      .set({ active: false })
      .where(eq(dancers.id, fixture.people[0].id));

    await expect(
      register(fixture, fixture.people[0].id),
    ).resolves.toMatchObject({ ok: false, code: "ineligible-person" });
    expect((await readInscription(inscriptionId))?.withdrawnAt).toBeInstanceOf(
      Date,
    );
  });

  test("refuses to register the same person twice while the row is active", async () => {
    const fixture = await seedFixture();
    expectRegistered(await register(fixture, fixture.people[0].id));

    await expect(
      register(fixture, fixture.people[0].id),
    ).resolves.toMatchObject({ ok: false, code: "already-registered" });
  });
});

describe("deleting a seminar that has withdrawn rows", () => {
  test("refuses while any row is there and succeeds once every row is gone", async () => {
    const fixture = await seedFixture();
    const inscriptionId = await registerCovered(fixture, fixture.people[0].id);

    await removeSeminarInscription({
      inscriptionId,
      seminarId: fixture.seminarId,
    });

    // Off every roster reading, and still a row: deleting the seminar would
    // cascade the money away.
    await expect(listSeminarInscriptions(fixture.seminarId)).resolves.toEqual(
      [],
    );
    await expect(deleteSeminar(fixture.seminarId)).resolves.toMatchObject({
      ok: false,
      code: "has-inscriptions",
    });

    await removeFromSeminarInscription({
      academyId: fixture.academyId,
      amount: depositAmount,
      eventId: fixture.eventId,
      inscriptionId,
      seminarId: fixture.seminarId,
    });
    // De-allocating is not enough on its own: the row is still there, and it is
    // removing it that makes the seminar deletable.
    await expect(deleteSeminar(fixture.seminarId)).resolves.toMatchObject({
      ok: false,
      code: "has-inscriptions",
    });

    await db
      .delete(seminarInscriptions)
      .where(eq(seminarInscriptions.id, inscriptionId));

    await expect(deleteSeminar(fixture.seminarId)).resolves.toEqual({
      ok: true,
    });
  });
});

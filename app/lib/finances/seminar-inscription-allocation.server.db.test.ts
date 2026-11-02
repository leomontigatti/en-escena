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
import { createDancer } from "@/lib/choreographies/registration.test-support";
import { readSeminarInscriptionPriceOptions } from "@/lib/finances/seminar-inscription-price-options.server";
import { readInscriptionAllocatedAmount } from "@/lib/finances/allocation-pool.server";
import { readAcademyAvailableBalance } from "@/lib/finances/available-balance.server";
import { allocateToInscription } from "@/lib/finances/inscription-money.server";
import { seminarNoPlacesForDepositMessage } from "@/lib/seminars/registration-refusals";
import { hasCoveredSeminarInscription } from "@/lib/seminars/seminar-places.server";
import { updateSeminar } from "@/lib/seminars/repository.server";
import {
  readSeminarPlaceLedger,
  reserveForHours,
} from "@/lib/seminars/seminars.test-support";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createAcademyFinanceChoreographyFixture } from "@/lib/admin/finances/finances.test-support";
import { createSavedEvent } from "@/lib/test-support/events";

import {
  installDatabaseTestHooks,
  isPgliteTestBackend,
} from "../../../tests/db/harness";

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

  // Two more dancers of the same academy, on the roster of no choreography: they
  // are priced as non-participants, and they are what the quota tests cross with.
  const roommates = [];
  for (const firstName of ["Bruno", "Celeste"]) {
    const dancer = await createDancer(academyId, {
      firstName,
      lastName: "Bailando",
    });
    const [row] = await db
      .insert(seminarInscriptions)
      .values({ dancerId: dancer.id, seminarId: seminar.id })
      .returning();

    roommates.push(row.id);
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
    secondInscriptionId: roommates[0]!,
    seminarId: seminar.id,
    thirdInscriptionId: roommates[1]!,
    watchingAcademyId: watching.academyId,
  };
}

type Fixture = Awaited<ReturnType<typeof seedFixture>>;

function allocate(
  fixture: Fixture,
  input: { amount: number; inscriptionId?: string; priceId: string | null },
) {
  return allocateToInscription({
    now: new Date(),
    academyId: fixture.academyId,
    amount: input.amount,
    eventId: fixture.eventId,
    target: {
      id: input.inscriptionId ?? fixture.inscriptionId,
      kind: "seminar",
    },
    priceId: input.priceId,
  });
}

/** Covers the participant's deposit, which is the one place the quota tests
 * start from: one taken place, whatever the seminar's quota says. */
async function coverFirstPlace(fixture: Fixture) {
  const covered = await allocate(fixture, {
    amount: amounts.specialParticipant / 2,
    priceId: fixture.priceIds.get("specialParticipant")!,
  });

  if (!covered.ok) {
    throw new Error(`Expected the deposit to be covered: ${covered.message}`);
  }
}

function setQuota(fixture: Fixture, quota: number) {
  return db
    .update(seminars)
    .set({ quota })
    .where(eq(seminars.id, fixture.seminarId));
}

/** Leaves a row of the other participant cell stored, as a person who started
 * or stopped dancing after it was charged would. */
function storeStaleRow(inscriptionId: string, priceId: string) {
  return db
    .update(seminarInscriptions)
    .set({ selectedPriceId: priceId })
    .where(eq(seminarInscriptions.id, inscriptionId));
}

async function readSelectedPriceId(inscriptionId: string) {
  const [row] = await db
    .select({ selectedPriceId: seminarInscriptions.selectedPriceId })
    .from(seminarInscriptions)
    .where(eq(seminarInscriptions.id, inscriptionId));

  return row?.selectedPriceId ?? null;
}

/** The deposit of a non-participant row, which is what the second and third
 * inscriptions cross at. */
const outsiderDeposit = amounts.specialOutsider / 2;

describe("seminar inscription allocation", () => {
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

  test("a covered row freezes the seminar's kind and its own deposit rate", async () => {
    const fixture = await seedFixture();
    await coverFirstPlace(fixture);

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
  });

  test("refuses the crossing that would take a place a full seminar has none of, and lets a partial allocation through", async () => {
    const fixture = await seedFixture();
    await coverFirstPlace(fixture);
    await setQuota(fixture, 1);

    // The quota is full of covered rows, so the write that would cover this
    // one's deposit is the only write refused.
    await expect(
      allocate(fixture, {
        amount: outsiderDeposit,
        inscriptionId: fixture.secondInscriptionId,
        priceId: fixture.priceIds.get("specialOutsider")!,
      }),
    ).resolves.toEqual({
      ok: false,
      message:
        "No quedan lugares en el seminario, así que esta inscripción no puede cubrir su seña.",
    });

    // A peso short of the deposit takes no place, so it goes through.
    await expect(
      allocate(fixture, {
        amount: outsiderDeposit - 1,
        inscriptionId: fixture.secondInscriptionId,
        priceId: fixture.priceIds.get("specialOutsider")!,
      }),
    ).resolves.toEqual({ ok: true });

    // Raising the quota is free, and the crossing it makes room for goes
    // through: the place was the only thing missing.
    await setQuota(fixture, 2);
    await expect(
      allocate(fixture, {
        amount: 1,
        inscriptionId: fixture.secondInscriptionId,
        priceId: fixture.priceIds.get("specialOutsider")!,
      }),
    ).resolves.toEqual({ ok: true });
  });

  test("keeps a place another registration reserves, and gives it up once that reservation lapses", async () => {
    const fixture = await seedFixture();
    await setQuota(fixture, 1);
    await reserveForHours(fixture.secondInscriptionId, 62);

    // The second registration reserved the one place: the third covering its
    // deposit would take it.
    await expect(
      allocate(fixture, {
        amount: outsiderDeposit,
        inscriptionId: fixture.thirdInscriptionId,
        priceId: fixture.priceIds.get("specialOutsider")!,
      }),
    ).resolves.toEqual({
      ok: false,
      message:
        "No quedan lugares en el seminario, así que esta inscripción no puede cubrir su seña.",
    });

    // Once the reservation lapses, the place is free to cover.
    await reserveForHours(fixture.secondInscriptionId, -1);
    await expect(
      allocate(fixture, {
        amount: outsiderDeposit,
        inscriptionId: fixture.thirdInscriptionId,
        priceId: fixture.priceIds.get("specialOutsider")!,
      }),
    ).resolves.toEqual({ ok: true });
  });

  test("refuses the cheaper price that would cover a deposit in a full seminar without new money crossing it", async () => {
    const fixture = await seedFixture();
    // 20000 sits under the `Exclusivo` deposit of 25000, so it holds no place.
    await expect(
      allocate(fixture, {
        amount: 20000,
        inscriptionId: fixture.secondInscriptionId,
        priceId: fixture.priceIds.get("specialOutsider")!,
      }),
    ).resolves.toEqual({ ok: true });
    await coverFirstPlace(fixture);
    await setQuota(fixture, 1);
    const [earlyBird] = await db
      .insert(seminarPrices)
      .values({
        amount: 30000,
        eventId: fixture.eventId,
        forParticipants: false,
        kind: "special",
        name: "Preventa",
        paymentDeadline: "2030-09-01",
      })
      .returning();

    // The cheaper row's deposit is 15000: the money already on the row would
    // cover it, so switching price is the crossing, and the seminar has no place.
    await expect(
      allocate(fixture, {
        amount: 1,
        inscriptionId: fixture.secondInscriptionId,
        priceId: earlyBird.id,
      }),
    ).resolves.toEqual({
      ok: false,
      message:
        "No quedan lugares en el seminario, así que esta inscripción no puede cubrir su seña.",
    });
  });

  test("with no pick, refuses a row of the other cell when no row of its own is in effect, and moves nothing", async () => {
    const fixture = await seedFixture();
    const stale = fixture.priceIds.get("specialOutsider")!;
    await storeStaleRow(fixture.inscriptionId, stale);
    await db
      .delete(seminarPrices)
      .where(
        inArray(seminarPrices.id, [
          fixture.priceIds.get("regularParticipant")!,
          fixture.priceIds.get("specialParticipant")!,
        ]),
      );
    const target = { id: fixture.inscriptionId, kind: "seminar" as const };
    const poolBefore = await readAcademyAvailableBalance(db, fixture);

    await expect(
      allocate(fixture, { amount: 1000, priceId: null }),
    ).resolves.toMatchObject({ ok: false });

    expect(await readSelectedPriceId(fixture.inscriptionId)).toBe(stale);
    expect(await readInscriptionAllocatedAmount(db, target)).toBe(0);
    expect(await readAcademyAvailableBalance(db, fixture)).toBe(poolBefore);
  });

  test("with no pick, money that only reaches a stale row's deposit takes no place in a full seminar", async () => {
    const fixture = await seedFixture();
    await coverFirstPlace(fixture);
    await setQuota(fixture, 1);
    await storeStaleRow(
      fixture.secondInscriptionId,
      fixture.priceIds.get("specialParticipant")!,
    );

    // 20000 covers the stale row's deposit, but the row in effect asks 25000.
    await expect(
      allocate(fixture, {
        amount: amounts.specialParticipant / 2,
        inscriptionId: fixture.secondInscriptionId,
        priceId: null,
      }),
    ).resolves.toEqual({ ok: true });

    expect(await readSelectedPriceId(fixture.secondInscriptionId)).toBe(
      fixture.priceIds.get("specialOutsider")!,
    );
  });

  test("with no pick, judges the quota against the deposit of the row in effect, which the stale row would have left uncovered", async () => {
    const fixture = await seedFixture();
    const stale = fixture.priceIds.get("specialOutsider")!;
    await expect(
      allocate(fixture, {
        amount: outsiderDeposit,
        inscriptionId: fixture.secondInscriptionId,
        priceId: stale,
      }),
    ).resolves.toEqual({ ok: true });
    await setQuota(fixture, 1);
    await storeStaleRow(fixture.inscriptionId, stale);

    // 20000 is the row in effect's deposit, and short of the stale row's 25000.
    await expect(
      allocate(fixture, {
        amount: amounts.specialParticipant / 2,
        priceId: null,
      }),
    ).resolves.toEqual({
      message: seminarNoPlacesForDepositMessage,
      ok: false,
    });

    expect(await readSelectedPriceId(fixture.inscriptionId)).toBe(stale);
  });

  test("lets a reserved registration cover its own deposit in a seminar its reservation fills", async () => {
    const fixture = await seedFixture();
    await setQuota(fixture, 1);
    await reserveForHours(fixture.secondInscriptionId, 62);

    await expect(
      allocate(fixture, {
        amount: outsiderDeposit,
        inscriptionId: fixture.secondInscriptionId,
        priceId: fixture.priceIds.get("specialOutsider")!,
      }),
    ).resolves.toEqual({ ok: true });
  });

  test("refuses over-allocation before the quota and the quota before the pool", async () => {
    const fixture = await seedFixture();
    await coverFirstPlace(fixture);
    await setQuota(fixture, 1);

    // More than the row owes is refused as over-allocation even though the same
    // write would also be refused for the place.
    await expect(
      allocate(fixture, {
        amount: amounts.specialOutsider + 1,
        inscriptionId: fixture.secondInscriptionId,
        priceId: fixture.priceIds.get("specialOutsider")!,
      }),
    ).resolves.toEqual({
      ok: false,
      message: "No se puede asignar más de lo que la inscripción adeuda.",
    });

    // And the place is read before the pool: what the academy has paid is not
    // the question once there is nowhere to put it.
    await db
      .update(payments)
      .set({ amount: amounts.specialParticipant / 2 })
      .where(eq(payments.academyId, fixture.academyId));
    await expect(
      allocate(fixture, {
        amount: outsiderDeposit,
        inscriptionId: fixture.secondInscriptionId,
        priceId: fixture.priceIds.get("specialOutsider")!,
      }),
    ).resolves.toMatchObject({
      message:
        "No quedan lugares en el seminario, así que esta inscripción no puede cubrir su seña.",
    });
  });

  /**
   * `seminarMoney` takes the seminar row `FOR UPDATE` before it
   * counts the covered inscriptions, so two crossings racing for the last place
   * are serialised: the second counts after the first has committed, finds the
   * quota full, and is refused.
   *
   * The fast suite runs both allocations through a single PGlite connection,
   * which serialises the transactions on its own — nothing contends for the
   * lock, and the assertion would hold even without it. So the race is only
   * proven on the Postgres backend.
   */
  describe.skipIf(isPgliteTestBackend())(
    "seminar quota under real contention",
    () => {
      test("lets exactly one of two crossings for the last place through", async () => {
        const fixture = await seedFixture();
        await setQuota(fixture, 1);

        const results = await Promise.all([
          allocate(fixture, {
            amount: outsiderDeposit,
            inscriptionId: fixture.secondInscriptionId,
            priceId: fixture.priceIds.get("specialOutsider")!,
          }),
          allocate(fixture, {
            amount: outsiderDeposit,
            inscriptionId: fixture.thirdInscriptionId,
            priceId: fixture.priceIds.get("specialOutsider")!,
          }),
        ]);

        expect(results.filter((result) => result.ok)).toHaveLength(1);
        expect(
          (await readSeminarPlaceLedger(fixture.seminarId)).coveredCount,
        ).toBe(1);
      });
    },
  );

  test("allows money after the seminar has started", async () => {
    const fixture = await seedFixture();
    await db
      .update(seminars)
      .set({ scheduledDate: "2020-01-01" })
      .where(eq(seminars.id, fixture.seminarId));

    await expect(
      allocate(fixture, {
        amount: amounts.specialParticipant / 2,
        priceId: fixture.priceIds.get("specialParticipant")!,
      }),
    ).resolves.toEqual({ ok: true });
    expect(await hasCoveredSeminarInscription(db, fixture.seminarId)).toBe(
      true,
    );
  });
});

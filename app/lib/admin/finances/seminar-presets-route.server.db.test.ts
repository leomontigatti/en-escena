import { eq, inArray } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  paymentAllocations,
  seminarInscriptions,
  seminarPrices,
  seminars,
} from "@/db/schema";
import {
  academyFinancesRouteArgs,
  academyFinancesUrl,
} from "@/lib/admin/finances/finances.test-support";
import {
  seedSeminarPresetFixture,
  type SeminarPresetFixture,
} from "@/lib/admin/finances/seminar-finances.test-support";
import { spreadFromPool } from "@/lib/finances/allocation-pool.server";
import { allocateToSeminarInscription } from "@/lib/finances/seminar-inscription-allocation.server";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { readSeminarPlaceLedgers } from "@/lib/seminars/seminar-places.server";
import { reserveForHours } from "@/lib/seminars/seminars.test-support";
import {
  action as academyFinancesAction,
  loader as academyFinancesLoader,
} from "@/routes/administracion.finanzas_.$academyId";

import {
  installDatabaseTestHooks,
  isPgliteTestBackend,
} from "../../../../tests/db/harness";
import { runBehindAHolder } from "../../../../tests/db/lock-contention";

installDatabaseTestHooks();

type Fixture = SeminarPresetFixture;

async function postPreset(
  fixture: Fixture,
  input: { intent: string; seminarIds: string[] },
) {
  const { request: signedIn } = await createSignedInRequest({
    email: `admin.${crypto.randomUUID()}@example.com`,
    role: "admin",
    requestUrl: academyFinancesUrl(fixture.academyId, fixture.eventId),
  });
  const formData = new FormData();
  formData.set("intent", input.intent);

  for (const seminarId of input.seminarIds) {
    formData.append("seminarId", seminarId);
  }

  return await academyFinancesAction(
    academyFinancesRouteArgs(
      new Request(academyFinancesUrl(fixture.academyId, fixture.eventId), {
        method: "POST",
        body: formData,
        headers: { cookie: signedIn.headers.get("cookie") ?? "" },
      }),
      fixture.academyId,
    ),
  );
}

async function loadPreviews(fixture: Fixture) {
  const { request } = await createSignedInRequest({
    email: `admin.${crypto.randomUUID()}@example.com`,
    role: "admin",
    requestUrl: academyFinancesUrl(fixture.academyId, fixture.eventId),
  });
  const loaderData = await academyFinancesLoader(
    academyFinancesRouteArgs(request, fixture.academyId),
  );

  return loaderData.seminarPresetPreviews;
}

/** The places the seminar's covered inscriptions hold, every academy's. */
async function readCoveredCount(seminarId: string) {
  return (
    await readSeminarPlaceLedgers(db, {
      now: new Date(),
      seminarIds: [seminarId],
    })
  ).get(seminarId)?.coveredCount;
}

async function readAllocatedByInscription(fixture: Fixture) {
  const ids = Object.values(fixture.inscriptions).map((row) => row.id);
  const rows = await db
    .select({
      amount: paymentAllocations.amount,
      inscriptionId: paymentAllocations.seminarInscriptionId,
    })
    .from(paymentAllocations)
    .where(inArray(paymentAllocations.seminarInscriptionId, ids));
  const allocated = new Map(ids.map((id) => [id, 0]));

  for (const row of rows) {
    allocated.set(
      row.inscriptionId!,
      (allocated.get(row.inscriptionId!) ?? 0) + row.amount,
    );
  }

  return allocated;
}

async function readStoredPriceNames(fixture: Fixture) {
  const rows = await db
    .select({ id: seminarInscriptions.id, name: seminarPrices.name })
    .from(seminarInscriptions)
    .innerJoin(
      seminarPrices,
      eq(seminarPrices.id, seminarInscriptions.selectedPriceId),
    )
    .where(
      inArray(
        seminarInscriptions.id,
        Object.values(fixture.inscriptions).map((row) => row.id),
      ),
    );

  return new Map(rows.map((row) => [row.id, row.name]));
}

async function readStoredPriceIds(fixture: Fixture) {
  const rows = await db
    .select({
      id: seminarInscriptions.id,
      selectedPriceId: seminarInscriptions.selectedPriceId,
    })
    .from(seminarInscriptions)
    .where(
      inArray(
        seminarInscriptions.id,
        Object.values(fixture.inscriptions).map((row) => row.id),
      ),
    );

  return new Map(rows.map((row) => [row.id, row.selectedPriceId]));
}

describe("the seminar presets on the academy's finance page", () => {
  test("`Pagar seña` over two seminars allocates every owed deposit and prices each person from their own cell", async () => {
    const fixture = await seedSeminarPresetFixture({ paymentAmount: 100000 });
    const { inscriptions } = fixture;

    // A seminar named twice is charged once.
    const result = await postPreset(fixture, {
      intent: "pay-seminar-deposit-preset",
      seminarIds: [fixture.special.id, fixture.regular.id, fixture.special.id],
    });

    expect(result).toMatchObject({ status: "success" });
    // Half of each person's row: the participant and the non-participant of
    // one seminar are priced from different cells, the open early-bird row
    // applies before the deadline-less one, and the expired cheaper row is not
    // applied to the non-participant of the `Común` seminar.
    expect(await readAllocatedByInscription(fixture)).toEqual(
      new Map([
        [inscriptions.specialParticipant.id, 20000],
        [inscriptions.specialOutsider.id, 22000],
        [inscriptions.regularParticipant.id, 10000],
        [inscriptions.regularOutsider.id, 15000],
        [inscriptions.regularLeaver.id, 0],
        [inscriptions.specialNeighbour.id, 0],
      ]),
    );
    expect(await readStoredPriceIds(fixture)).toEqual(
      new Map([
        [inscriptions.specialParticipant.id, fixture.priceId("special", true)],
        [inscriptions.specialOutsider.id, fixture.earlyBirdId],
        [inscriptions.regularParticipant.id, fixture.priceId("regular", true)],
        [inscriptions.regularOutsider.id, fixture.priceId("regular", false)],
        [inscriptions.regularLeaver.id, null],
        [inscriptions.specialNeighbour.id, null],
      ]),
    );
  });

  test("`Pagar saldo` allocates every owed balance, deposit included, and keeps a price already held", async () => {
    const fixture = await seedSeminarPresetFixture({ paymentAmount: 200000 });
    const { inscriptions } = fixture;
    // Somebody priced this one on purpose, at the deadline-less row while the
    // early-bird one is still open, and covered its deposit.
    const chosen = fixture.priceId("special", false);

    expect(
      await allocateToSeminarInscription({
        academyId: fixture.academyId,
        amount: 25000,
        eventId: fixture.eventId,
        inscriptionId: inscriptions.specialOutsider.id,
        priceId: chosen,
        seminarId: fixture.special.id,
      }),
    ).toEqual({ ok: true });

    const result = await postPreset(fixture, {
      intent: "pay-seminar-balance-preset",
      seminarIds: [fixture.special.id, fixture.regular.id],
    });

    expect(result).toMatchObject({ status: "success" });
    expect(await readAllocatedByInscription(fixture)).toEqual(
      new Map([
        [inscriptions.specialParticipant.id, 40000],
        [inscriptions.specialOutsider.id, 50000],
        [inscriptions.regularParticipant.id, 20000],
        [inscriptions.regularOutsider.id, 30000],
        [inscriptions.regularLeaver.id, 0],
        [inscriptions.specialNeighbour.id, 0],
      ]),
    );
    expect(
      (await readStoredPriceIds(fixture)).get(inscriptions.specialOutsider.id),
    ).toBe(chosen);
  });

  test("running the same preset twice moves nothing the second time", async () => {
    const fixture = await seedSeminarPresetFixture({ paymentAmount: 100000 });
    const input = {
      intent: "pay-seminar-deposit-preset",
      seminarIds: [fixture.special.id, fixture.regular.id],
    };

    await postPreset(fixture, input);
    const afterFirst = await readAllocatedByInscription(fixture);

    expect(await postPreset(fixture, input)).toMatchObject({
      status: "success",
    });
    expect(await readAllocatedByInscription(fixture)).toEqual(afterFirst);
  });

  test("a seminar short of places refuses the whole charge, counting the places already taken and naming each seminar short", async () => {
    const fixture = await seedSeminarPresetFixture({ paymentAmount: 100000 });

    // One place of the `Exclusivo` seminar is already taken.
    expect(
      await allocateToSeminarInscription({
        academyId: fixture.academyId,
        amount: 20000,
        eventId: fixture.eventId,
        inscriptionId: fixture.inscriptions.specialParticipant.id,
        priceId: fixture.priceId("special", true),
        seminarId: fixture.special.id,
      }),
    ).toEqual({ ok: true });
    await db
      .update(seminars)
      .set({ quota: 1 })
      .where(inArray(seminars.id, [fixture.special.id, fixture.regular.id]));
    const allocatedBefore = await readAllocatedByInscription(fixture);
    const storedBefore = await readStoredPriceIds(fixture);

    const result = await postPreset(fixture, {
      intent: "pay-seminar-deposit-preset",
      seminarIds: [fixture.special.id, fixture.regular.id],
    });

    // `Exclusivo`: one taken plus one to cross against one place. `Común`: two
    // to cross against one place. The seminars are named in id order.
    expect(result).toEqual({
      status: "error",
      message: expect.any(String),
    });
    expect(
      (result as { message: string }).message.split(/(?<=\.) /).sort(),
    ).toEqual([
      "No quedan lugares suficientes en el seminario de Abril Sosa del 10 de octubre de 2030: falta 1.",
      "No quedan lugares suficientes en el seminario de Nicolás Prado del 11 de octubre de 2030: falta 1.",
    ]);
    expect(await readAllocatedByInscription(fixture)).toEqual(allocatedBefore);
    expect(await readStoredPriceIds(fixture)).toEqual(storedBefore);
  });

  test("a pool that cannot cover the charge refuses the whole charge", async () => {
    // Enough for the first seminar's deposits, not for both.
    const fixture = await seedSeminarPresetFixture({ paymentAmount: 50000 });

    const result = await postPreset(fixture, {
      intent: "pay-seminar-deposit-preset",
      seminarIds: [fixture.special.id, fixture.regular.id],
    });

    expect(result).toEqual({
      status: "error",
      message: "La academia no tiene saldo disponible suficiente.",
    });
    expect(
      [...(await readAllocatedByInscription(fixture)).values()].every(
        (amount) => amount === 0,
      ),
    ).toBe(true);
    expect(
      [...(await readStoredPriceIds(fixture)).values()].every(
        (priceId) => priceId === null,
      ),
    ).toBe(true);
  });

  test("refuses a seminar that is not one of the event's", async () => {
    const fixture = await seedSeminarPresetFixture({ paymentAmount: 100000 });

    const result = await postPreset(fixture, {
      intent: "pay-seminar-deposit-preset",
      seminarIds: [fixture.special.id, crypto.randomUUID()],
    });

    expect(result).toEqual({
      status: "error",
      message: "No encontramos ese seminario.",
    });
    expect(
      [...(await readAllocatedByInscription(fixture)).values()].every(
        (amount) => amount === 0,
      ),
    ).toBe(true);
  });
});

describe("an inscription holding a price that is not today's, below its deposit", () => {
  // The preset keeps a held price, so it charges by it: the amount, the place
  // and the preview's price name all come from the row the inscription holds,
  // never from the row that applies today.
  test("`Pagar seña` covers the held row's deposit and takes the place it needs", async () => {
    const fixture = await seedSeminarPresetFixture({ paymentAmount: 100000 });
    const { inscriptions } = fixture;
    // Today's row is the early-bird one (44.000, deposit 22.000); the held one
    // is dearer (50.000, deposit 25.000).
    const held = fixture.priceId("special", false);

    expect(
      await allocateToSeminarInscription({
        academyId: fixture.academyId,
        amount: 10000,
        eventId: fixture.eventId,
        inscriptionId: inscriptions.specialOutsider.id,
        priceId: held,
        seminarId: fixture.special.id,
      }),
    ).toEqual({ ok: true });

    const special = (await loadPreviews(fixture))[fixture.special.id]!;

    expect(special.stages.deposit.neededCount).toBe(2);
    expect(
      special.stages.deposit.people.find(
        (person) => person.inscriptionId === inscriptions.specialOutsider.id,
      ),
    ).toMatchObject({ amount: 15000, priceName: "special no participante" });

    expect(
      await postPreset(fixture, {
        intent: "pay-seminar-deposit-preset",
        seminarIds: [fixture.special.id],
      }),
    ).toMatchObject({ status: "success" });

    expect(
      (await readAllocatedByInscription(fixture)).get(
        inscriptions.specialOutsider.id,
      ),
    ).toBe(25000);
    expect(
      (await readStoredPriceIds(fixture)).get(inscriptions.specialOutsider.id),
    ).toBe(held);
    expect(await readCoveredCount(fixture.special.id)).toBe(2);
  });

  test("`Pagar saldo` stops at the held row's total, dearer or cheaper than today's", async () => {
    const fixture = await seedSeminarPresetFixture({ paymentAmount: 200000 });
    const { inscriptions } = fixture;
    // Dearer than today's early-bird row: 50.000 against 44.000.
    const dearer = fixture.priceId("special", false);
    // Cheaper than today's 30.000: the expired row, picked on purpose.
    const cheaper = fixture.expiredPriceId;

    for (const [inscriptionId, seminarId, priceId, amount] of [
      [inscriptions.specialOutsider.id, fixture.special.id, dearer, 10000],
      [inscriptions.regularOutsider.id, fixture.regular.id, cheaper, 500],
    ] as const) {
      expect(
        await allocateToSeminarInscription({
          academyId: fixture.academyId,
          amount,
          eventId: fixture.eventId,
          inscriptionId,
          priceId,
          seminarId,
        }),
      ).toEqual({ ok: true });
    }

    const previews = await loadPreviews(fixture);
    const previewed = [
      ...previews[fixture.special.id]!.stages.balance.people,
      ...previews[fixture.regular.id]!.stages.balance.people,
    ];

    expect(
      previewed.find(
        (person) => person.inscriptionId === inscriptions.specialOutsider.id,
      ),
    ).toMatchObject({ amount: 40000, priceName: "special no participante" });
    expect(
      previewed.find(
        (person) => person.inscriptionId === inscriptions.regularOutsider.id,
      ),
    ).toMatchObject({ amount: 1500, priceName: "Preventa vencida" });

    expect(
      await postPreset(fixture, {
        intent: "pay-seminar-balance-preset",
        seminarIds: [fixture.special.id, fixture.regular.id],
      }),
    ).toMatchObject({ status: "success" });

    const allocated = await readAllocatedByInscription(fixture);
    const stored = await readStoredPriceIds(fixture);

    expect(allocated.get(inscriptions.specialOutsider.id)).toBe(50000);
    expect(allocated.get(inscriptions.regularOutsider.id)).toBe(2000);
    expect(stored.get(inscriptions.specialOutsider.id)).toBe(dearer);
    expect(stored.get(inscriptions.regularOutsider.id)).toBe(cheaper);
  });
});

describe("an inscription priced from the other participant cell, below its deposit", () => {
  // The outsider is priced as a non-participant, pays short of that row's
  // deposit and only then starts dancing. Below the deposit nothing froze the
  // participant fact, so the preset charges by today's row of their new cell
  // and stores it in place of the stale one.
  async function startDancing(fixture: Fixture, dancerId: string) {
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: fixture.choreographyId,
      dancerId,
    });
  }

  async function payShortOfOutsiderDeposit(fixture: Fixture, amount: number) {
    const { specialOutsider } = fixture.inscriptions;

    expect(
      await allocateToSeminarInscription({
        academyId: fixture.academyId,
        amount,
        eventId: fixture.eventId,
        inscriptionId: specialOutsider.id,
        // 50.000, deposit 25.000.
        priceId: fixture.priceId("special", false),
        seminarId: fixture.special.id,
      }),
    ).toEqual({ ok: true });
    await startDancing(fixture, specialOutsider.dancerId!);
  }

  test("`Pagar saldo` charges the rest of the participant row and stores it", async () => {
    const fixture = await seedSeminarPresetFixture({ paymentAmount: 200000 });
    const { specialOutsider } = fixture.inscriptions;

    await payShortOfOutsiderDeposit(fixture, 10000);

    expect(
      (await loadPreviews(fixture))[
        fixture.special.id
      ]!.stages.balance.people.find(
        (person) => person.inscriptionId === specialOutsider.id,
      ),
    ).toMatchObject({ amount: 30000, priceName: "special participante" });

    expect(
      await postPreset(fixture, {
        intent: "pay-seminar-balance-preset",
        seminarIds: [fixture.special.id],
      }),
    ).toMatchObject({ status: "success" });

    expect(
      (await readAllocatedByInscription(fixture)).get(specialOutsider.id),
    ).toBe(40000);
    expect((await readStoredPriceIds(fixture)).get(specialOutsider.id)).toBe(
      fixture.priceId("special", true),
    );
  });

  test("`Pagar seña` takes the place of a deposit the participant row already counts as paid, moving no money", async () => {
    const fixture = await seedSeminarPresetFixture({ paymentAmount: 100000 });
    const { specialOutsider } = fixture.inscriptions;

    // The participant row's whole deposit (40.000 at 50 %), short of the
    // stored row's 25.000.
    await payShortOfOutsiderDeposit(fixture, 20000);

    const deposit = (await loadPreviews(fixture))[fixture.special.id]!.stages
      .deposit;

    expect(
      deposit.people.find(
        (person) => person.inscriptionId === specialOutsider.id,
      ),
    ).toMatchObject({ amount: 0, priceName: "special participante" });
    expect(deposit.neededCount).toBe(2);

    expect(
      await postPreset(fixture, {
        intent: "pay-seminar-deposit-preset",
        seminarIds: [fixture.special.id],
      }),
    ).toMatchObject({ status: "success" });

    expect(
      (await readAllocatedByInscription(fixture)).get(specialOutsider.id),
    ).toBe(20000);
    expect((await readStoredPriceIds(fixture)).get(specialOutsider.id)).toBe(
      fixture.priceId("special", true),
    );
    expect(await readCoveredCount(fixture.special.id)).toBe(2);
  });
  test("refuses a charge that would leave the person holding more than the participant row's total", async () => {
    const fixture = await seedSeminarPresetFixture({ paymentAmount: 100000 });
    const { specialOutsider } = fixture.inscriptions;

    // At a 99 % deposit, 43.000 is short of the held row's 49.500 deposit,
    // within today's non-participant row (44.000) and past the whole
    // participant row, 40.000.
    await db
      .update(seminars)
      .set({ requiredDepositPercentage: 99 })
      .where(eq(seminars.id, fixture.special.id));
    await payShortOfOutsiderDeposit(fixture, 43000);

    expect(
      (await loadPreviews(fixture))[
        fixture.special.id
      ]!.stages.deposit.people.find(
        (person) => person.inscriptionId === specialOutsider.id,
      ),
    ).toMatchObject({ amount: 0, overAllocatedAmount: 3000 });

    const result = await postPreset(fixture, {
      intent: "pay-seminar-deposit-preset",
      seminarIds: [fixture.special.id],
    });

    expect(result).toMatchObject({
      status: "error",
      message: expect.stringContaining("Bruno Mirando"),
    });
    expect(
      (await readAllocatedByInscription(fixture)).get(specialOutsider.id),
    ).toBe(43000);
    expect((await readStoredPriceIds(fixture)).get(specialOutsider.id)).toBe(
      fixture.priceId("special", false),
    );
  });
});

describe("the seminar preset preview in the academy's finance loader", () => {
  test("`Pagar seña`: the people, prices and amounts it lists are what the action then writes", async () => {
    const fixture = await seedSeminarPresetFixture({ paymentAmount: 100000 });
    const { inscriptions } = fixture;
    await reserveForHours(inscriptions.specialNeighbour.id, 10);

    const previews = await loadPreviews(fixture);
    const special = previews[fixture.special.id]!;
    const regular = previews[fixture.regular.id]!;

    // The withdrawn person and the other academy's person are not listed.
    expect(special).toMatchObject({
      instructorName: "Abril Sosa",
      scheduledDate: "2030-10-10",
    });
    expect(special.stages.deposit).toEqual({
      neededCount: 2,
      // Twenty places, one of them reserved by the other academy's
      // registration, which the charge counts as taken.
      placesLeft: 19,
      shortBy: 0,
      people: [
        {
          amount: 20000,
          inscriptionId: inscriptions.specialParticipant.id,
          overAllocatedAmount: 0,
          personName: "Ana Bailando",
          priceName: "special participante",
        },
        {
          amount: 22000,
          inscriptionId: inscriptions.specialOutsider.id,
          overAllocatedAmount: 0,
          personName: "Bruno Mirando",
          priceName: "Preventa exclusiva",
        },
      ],
    });
    expect(
      regular.stages.deposit.people.map((person) => person.inscriptionId),
    ).toEqual([
      inscriptions.regularParticipant.id,
      inscriptions.regularOutsider.id,
    ]);

    expect(
      await postPreset(fixture, {
        intent: "pay-seminar-deposit-preset",
        seminarIds: [fixture.special.id, fixture.regular.id],
      }),
    ).toMatchObject({ status: "success" });

    const allocated = await readAllocatedByInscription(fixture);
    const storedNames = await readStoredPriceNames(fixture);
    const previewed = [
      ...special.stages.deposit.people,
      ...regular.stages.deposit.people,
    ];

    for (const person of previewed) {
      expect(allocated.get(person.inscriptionId)).toBe(person.amount);
      expect(storedNames.get(person.inscriptionId)).toBe(person.priceName);
    }

    // The places the preview said the charge needs are the places it took.
    const after = await loadPreviews(fixture);

    expect(await readCoveredCount(fixture.special.id)).toBe(
      special.stages.deposit.neededCount,
    );
    expect(await readCoveredCount(fixture.regular.id)).toBe(
      regular.stages.deposit.neededCount,
    );
    // Nothing is left owing for the deposit, so the preview lists nobody.
    expect(after[fixture.special.id]!.stages.deposit).toEqual({
      neededCount: 0,
      people: [],
      placesLeft: 17,
      shortBy: 0,
    });
  });

  test("`Pagar saldo` lists a covered person at the price they hold, for the rest only, and needs no place for them", async () => {
    const fixture = await seedSeminarPresetFixture({ paymentAmount: 200000 });
    const { inscriptions } = fixture;
    const chosen = fixture.priceId("special", false);

    expect(
      await allocateToSeminarInscription({
        academyId: fixture.academyId,
        amount: 25000,
        eventId: fixture.eventId,
        inscriptionId: inscriptions.specialOutsider.id,
        priceId: chosen,
        seminarId: fixture.special.id,
      }),
    ).toEqual({ ok: true });

    const special = (await loadPreviews(fixture))[fixture.special.id]!;

    expect(await readCoveredCount(fixture.special.id)).toBe(1);
    expect(special.stages.deposit.people.map((p) => p.inscriptionId)).toEqual([
      inscriptions.specialParticipant.id,
    ]);
    expect(special.stages.balance).toEqual({
      neededCount: 1,
      placesLeft: 19,
      shortBy: 0,
      people: [
        {
          amount: 40000,
          inscriptionId: inscriptions.specialParticipant.id,
          overAllocatedAmount: 0,
          personName: "Ana Bailando",
          priceName: "special participante",
        },
        {
          amount: 25000,
          inscriptionId: inscriptions.specialOutsider.id,
          overAllocatedAmount: 0,
          personName: "Bruno Mirando",
          priceName: "special no participante",
        },
      ],
    });

    expect(
      await postPreset(fixture, {
        intent: "pay-seminar-balance-preset",
        seminarIds: [fixture.special.id],
      }),
    ).toMatchObject({ status: "success" });

    const allocated = await readAllocatedByInscription(fixture);

    expect(allocated.get(inscriptions.specialParticipant.id)).toBe(40000);
    expect(allocated.get(inscriptions.specialOutsider.id)).toBe(50000);
    expect(
      (await readStoredPriceNames(fixture)).get(
        inscriptions.specialOutsider.id,
      ),
    ).toBe("special no participante");
  });
});

/**
 * Two writes for one academy on disjoint inscriptions share nothing but the
 * pool, so only the academy's pool lock can keep them from both spending the
 * same free money. The fast suite runs them through one PGlite connection,
 * which serialises them on its own and would pass without the lock, so this
 * runs on Postgres only.
 */
describe.skipIf(isPgliteTestBackend())(
  "the academy's pool under real contention",
  () => {
    test("a preset that waits on a spread for another seminar reads the pool that spread left, and refuses the charge", async () => {
      // Enough for one seminar's deposits, not for both.
      const fixture = await seedSeminarPresetFixture({ paymentAmount: 30000 });
      const { inscriptions } = fixture;

      const result = await runBehindAHolder({
        waitingOn: "academy pool lock",
        hold: async (tx) =>
          expect(
            await spreadFromPool(tx, {
              academyId: fixture.academyId,
              amount: 20000,
              eventId: fixture.eventId,
              target: {
                id: inscriptions.specialParticipant.id,
                kind: "seminar",
              },
            }),
          ).toEqual({ ok: true }),
        contender: () =>
          postPreset(fixture, {
            intent: "pay-seminar-deposit-preset",
            seminarIds: [fixture.regular.id],
          }),
      });

      expect(result).toEqual({
        status: "error",
        message: "La academia no tiene saldo disponible suficiente.",
      });
      const allocated = await readAllocatedByInscription(fixture);
      expect(allocated.get(inscriptions.specialParticipant.id)).toBe(20000);
      expect(
        [...allocated.values()].reduce((sum, amount) => sum + amount, 0),
      ).toBeLessThanOrEqual(30000);
    });
  },
);

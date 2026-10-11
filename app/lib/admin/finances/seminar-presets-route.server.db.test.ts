import { eq, inArray } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  paymentAllocations,
  payments,
  seminarInscriptions,
  seminarPrices,
  seminars,
} from "@/db/schema";
import {
  academyFinancesRouteArgs,
  academyFinancesUrl,
  createAcademyFinanceChoreographyFixture,
} from "@/lib/admin/finances/finances.test-support";
import { createDancer } from "@/lib/choreographies/registration.test-support";
import { allocateToSeminarInscription } from "@/lib/finances/seminar-inscription-allocation.server";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent } from "@/lib/test-support/events";
import {
  action as academyFinancesAction,
  loader as academyFinancesLoader,
} from "@/routes/administracion.finanzas_.$academyId";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

/**
 * Two seminars of one event — an `Exclusivo` one and a `Común` one — with a full
 * four-cell price list plus two dated rows: an expired one that must never apply
 * and an early-bird one still open. One academy holds a participant and a
 * non-participant in each seminar, and a withdrawn third person in the `Común`
 * one; another academy holds a person in the `Exclusivo` one.
 */
async function seedFixture(input: { paymentAmount: number }) {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const academy = await createAcademyFinanceChoreographyFixture({
    academyName: "Academia Bailando",
    choreographyName: "Aire",
    email: `bailando.${crypto.randomUUID()}@example.com`,
    event,
  });
  const other = await createAcademyFinanceChoreographyFixture({
    academyName: "Academia Vecina",
    catalog: academy.catalog,
    choreographyName: "Brisa",
    email: `vecina.${crypto.randomUUID()}@example.com`,
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
  const leaver = await createDancer(academyId, {
    firstName: "Carla",
    lastName: "Retirada",
  });
  const neighbour = await createDancer(other.academy.academy.id, {
    firstName: "Dora",
    lastName: "Vecina",
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
    .values([
      ...(
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
      // Still open, so it is what a non-participant of an `Exclusivo` seminar
      // is charged today.
      {
        amount: 44000,
        eventId: event.id,
        forParticipants: false,
        kind: "special" as const,
        name: "Preventa exclusiva",
        paymentDeadline: "2099-12-31",
      },
      // Cheaper, but its deadline has passed: today's resolution skips it.
      {
        amount: 2000,
        eventId: event.id,
        forParticipants: false,
        kind: "regular" as const,
        name: "Preventa vencida",
        paymentDeadline: "2020-01-01",
      },
    ])
    .returning();
  const earlyBirdId = priceRows.find(
    (row) => row.name === "Preventa exclusiva",
  )!.id;
  const priceId = (kind: "regular" | "special", forParticipants: boolean) =>
    priceRows.find(
      (row) =>
        row.kind === kind &&
        row.forParticipants === forParticipants &&
        row.paymentDeadline === null,
    )!.id;

  const [
    specialParticipant,
    specialOutsider,
    regularParticipant,
    regularOutsider,
    regularLeaver,
    specialNeighbour,
  ] = await db
    .insert(seminarInscriptions)
    .values([
      { dancerId: participant.id, seminarId: special!.id },
      { dancerId: outsider.id, seminarId: special!.id },
      { dancerId: participant.id, seminarId: regular!.id },
      { dancerId: outsider.id, seminarId: regular!.id },
      {
        dancerId: leaver.id,
        seminarId: regular!.id,
        withdrawnAt: new Date("2030-04-01T12:00:00Z"),
      },
      { dancerId: neighbour.id, seminarId: special!.id },
    ])
    .returning();

  await db.insert(payments).values({
    academyId,
    amount: input.paymentAmount,
    eventId: event.id,
    paymentDate: "2030-04-01",
    paymentMethod: "transferencia",
    paymentNumber: 1,
  });

  return {
    academyId,
    earlyBirdId,
    eventId: event.id,
    inscriptions: {
      regularLeaver: regularLeaver!,
      regularOutsider: regularOutsider!,
      regularParticipant: regularParticipant!,
      specialNeighbour: specialNeighbour!,
      specialOutsider: specialOutsider!,
      specialParticipant: specialParticipant!,
    },
    priceId,
    regular: regular!,
    special: special!,
  };
}

type Fixture = Awaited<ReturnType<typeof seedFixture>>;

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
    const fixture = await seedFixture({ paymentAmount: 100000 });
    const { inscriptions } = fixture;

    const result = await postPreset(fixture, {
      intent: "pay-seminar-deposit-preset",
      seminarIds: [fixture.special.id, fixture.regular.id],
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
    const fixture = await seedFixture({ paymentAmount: 200000 });
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
    const fixture = await seedFixture({ paymentAmount: 100000 });
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

  test("a seminar short of places refuses the whole charge, naming it and the shortfall", async () => {
    const fixture = await seedFixture({ paymentAmount: 100000 });

    await db
      .update(seminars)
      .set({ quota: 1 })
      .where(eq(seminars.id, fixture.special.id));

    const result = await postPreset(fixture, {
      intent: "pay-seminar-deposit-preset",
      seminarIds: [fixture.special.id, fixture.regular.id],
    });

    expect(result).toEqual({
      status: "error",
      message:
        "No quedan lugares suficientes en el seminario de Abril Sosa del 10 de octubre de 2030: falta 1.",
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

  test("a pool that cannot cover the charge refuses the whole charge", async () => {
    // Enough for the first seminar's deposits, not for both.
    const fixture = await seedFixture({ paymentAmount: 50000 });

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
    const fixture = await seedFixture({ paymentAmount: 100000 });

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

describe("the seminar preset preview in the academy's finance loader", () => {
  test("`Pagar seña`: the people, prices and amounts it lists are what the action then writes", async () => {
    const fixture = await seedFixture({ paymentAmount: 100000 });
    const { inscriptions } = fixture;

    const previews = await loadPreviews(fixture);
    const special = previews[fixture.special.id]!;
    const regular = previews[fixture.regular.id]!;

    // The withdrawn person and the other academy's person are not listed.
    expect(special).toMatchObject({
      coveredCount: 0,
      instructorName: "Abril Sosa",
      quota: 20,
      scheduledDate: "2030-10-10",
    });
    expect(special.stages.deposit).toEqual({
      neededCount: 2,
      people: [
        {
          amount: 20000,
          inscriptionId: inscriptions.specialParticipant.id,
          personName: "Ana Bailando",
          priceName: "special participante",
        },
        {
          amount: 22000,
          inscriptionId: inscriptions.specialOutsider.id,
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

    expect(after[fixture.special.id]!.coveredCount).toBe(
      special.stages.deposit.neededCount,
    );
    expect(after[fixture.regular.id]!.coveredCount).toBe(
      regular.stages.deposit.neededCount,
    );
    // Nothing is left owing for the deposit, so the preview lists nobody.
    expect(after[fixture.special.id]!.stages.deposit).toEqual({
      neededCount: 0,
      people: [],
    });
  });

  test("`Pagar saldo` lists a covered person at the price they hold, for the rest only, and needs no place for them", async () => {
    const fixture = await seedFixture({ paymentAmount: 200000 });
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

    expect(special.coveredCount).toBe(1);
    expect(special.stages.deposit.people.map((p) => p.inscriptionId)).toEqual([
      inscriptions.specialParticipant.id,
    ]);
    expect(special.stages.balance).toEqual({
      neededCount: 1,
      people: [
        {
          amount: 40000,
          inscriptionId: inscriptions.specialParticipant.id,
          personName: "Ana Bailando",
          priceName: "special participante",
        },
        {
          amount: 25000,
          inscriptionId: inscriptions.specialOutsider.id,
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

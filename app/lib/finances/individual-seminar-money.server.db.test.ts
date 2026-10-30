import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { seminarInscriptions, seminarPrices, seminars } from "@/db/schema";
import {
  handlePaymentCreateAction,
  loadPaymentCreate,
} from "@/features/admin/payments/create/server";
import { buildGlobalPaymentRequest } from "@/lib/admin/finances/finances.test-support";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import { readOwnerEventMovements } from "@/lib/finances/owner-event-movements.server";
import {
  paySeminarsPreset,
  readSeminarCobroPreviews,
} from "@/lib/finances/seminar-cobro-presets.server";
import {
  allocateToSeminarInscription,
  readSeminarInscriptionPriceOptions,
} from "@/lib/finances/seminar-inscription-allocation.server";
import { readSeminarInscriptionFinanceRows } from "@/lib/finances/seminar-inscriptions.server";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent } from "@/lib/test-support/events";
import { createIndividualUser } from "@/lib/test-support/individuals";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

/**
 * An individual's money works as an academy's (ADR-0019): payments,
 * allocations and the `Saldo disponible` key on its owner row of kind
 * `individual`, through the same paths an academy's go through.
 */

const priceAmount = 30000;

/** One individual registered into two seminars of the active event, priced
 * at the ordinary row, which is what it pays without a confirmed link. */
async function seedIndividualInTwoSeminars() {
  const event = await createSavedEvent({ requiredDepositPercentage: 50 });
  const individual = await createIndividualUser({
    email: `particular.${crypto.randomUUID()}@example.com`,
    firstName: "Ana",
    lastName: "Pérez",
  });

  await db.insert(seminarPrices).values({
    amount: priceAmount,
    eventId: event.id,
    forParticipants: false,
    kind: "regular",
    name: "Precio general",
    paymentDeadline: null,
  });

  const seminarRows = await db
    .insert(seminars)
    .values(
      ["Abril Sosa", "Bruno Díaz"].map((instructorName) => ({
        eventId: event.id,
        instructorName,
        kind: "regular" as const,
        quota: 20,
        requiredDepositPercentage: 50,
        scheduledDate: "2030-10-10",
        startTime: "18:30",
      })),
    )
    .returning();
  const inscriptions = await db
    .insert(seminarInscriptions)
    .values(
      seminarRows.map((seminar) => ({
        individualId: individual.individualId,
        seminarId: seminar.id,
      })),
    )
    .returning();

  return { event, individual, inscriptions, seminars: seminarRows };
}

async function recordPayment(ownerId: string, amount: number) {
  const { request } = await buildGlobalPaymentRequest({
    academyId: ownerId,
    amount: String(amount),
    paymentDate: "2026-04-01",
    paymentMethod: "transferencia",
    requestUrl: "http://localhost/administracion/movimientos/pagos/nuevo",
    role: "admin",
  });

  await expect(handlePaymentCreateAction(request)).rejects.toBeInstanceOf(
    Response,
  );
}

/** What each inscription holds, as the seminar finance read reports it. */
async function readAllocated(eventId: string, inscriptionIds: string[]) {
  const rows = await readSeminarInscriptionFinanceRows({ eventId }, new Date());

  return new Map(
    inscriptionIds.map((id) => [
      id,
      rows.find((row) => row.inscriptionId === id)?.allocatedAmount,
    ]),
  );
}

describe("an individual's seminar money", () => {
  test("the payment picker offers individuals beside academies, told apart by kind", async () => {
    await createSavedEvent();
    await createAcademyUser({
      academyName: "Academia Norte",
      email: `norte.${crypto.randomUUID()}@example.com`,
    });
    await createIndividualUser({
      email: `particular.${crypto.randomUUID()}@example.com`,
      firstName: "Ana",
      lastName: "Pérez",
    });
    const { request } = await createSignedInRequest({
      email: `admin.${crypto.randomUUID()}@example.com`,
      requestUrl: "http://localhost/administracion/movimientos/pagos/nuevo",
      role: "admin",
    });

    const loaderData = await loadPaymentCreate(request);

    expect(
      loaderData.academies.map(({ kind, name }) => ({ kind, name })),
    ).toEqual([
      { kind: "academy", name: "Academia Norte" },
      { kind: "individual", name: "Ana Pérez" },
    ]);
  });

  test("administration records a payment against the individual and allocates it to its inscription", async () => {
    const fixture = await seedIndividualInTwoSeminars();
    const { ownerId } = fixture.individual;

    await recordPayment(ownerId, 20000);

    await expect(
      readOwnerEventMovements({
        academyId: ownerId,
        eventId: fixture.event.id,
      }),
    ).resolves.toMatchObject([{ amount: 20000 }]);

    const [first] = fixture.inscriptions;
    // The allocation dialog offers the individual its own cell, as it offers
    // an academy's person theirs.
    const options = await readSeminarInscriptionPriceOptions({
      eventId: fixture.event.id,
      seminarId: first.seminarId,
    });
    const [price] = options.get(first.id) ?? [];
    expect(price).toMatchObject({
      amount: priceAmount,
      depositAmount: priceAmount / 2,
    });

    const allocated = await allocateToSeminarInscription({
      now: new Date(),
      academyId: ownerId,
      amount: priceAmount / 2,
      eventId: fixture.event.id,
      inscriptionId: first.id,
      priceId: price?.id ?? null,
      seminarId: first.seminarId,
    });

    expect(allocated).toEqual({ ok: true });

    const detail = await readAcademyEventOperationalFinanceDetail({
      academyId: ownerId,
      eventId: fixture.event.id,
    });

    // The pool is the individual's own: what it paid minus what it placed.
    expect(detail.summary.availableBalanceAmount).toBe(20000 - priceAmount / 2);
    expect(
      detail.seminarFinanceRows.map((row) => ({
        financialStatus: row.financialStatus,
        instructorName: row.instructorName,
      })),
    ).toEqual(
      expect.arrayContaining([
        { financialStatus: "depositMet", instructorName: "Abril Sosa" },
        { financialStatus: "depositPending", instructorName: "Bruno Díaz" },
      ]),
    );
  });

  // Administration's seminar finance views used to name an individual like a
  // dancer, with nothing to tell the two apart.
  test("the seminar finance read names the individual's inscriptions by their kind", async () => {
    const fixture = await seedIndividualInTwoSeminars();

    const rows = await readSeminarInscriptionFinanceRows(
      {
        eventId: fixture.event.id,
      },
      new Date(),
    );

    expect(
      rows.map(({ lastName, personKind }) => ({ lastName, personKind })),
    ).toEqual([
      { lastName: "Pérez", personKind: "individual" },
      { lastName: "Pérez", personKind: "individual" },
    ]);
  });

  test("`Pagar seña` over its seminars names the individual and funds each deposit", async () => {
    const fixture = await seedIndividualInTwoSeminars();
    const { ownerId } = fixture.individual;
    await recordPayment(ownerId, 100000);

    const previews = await readSeminarCobroPreviews({
      academyId: ownerId,
      eventId: fixture.event.id,
      now: new Date(),
    });

    expect(
      fixture.seminars.map(
        (seminar) => previews[seminar.id]?.stages.deposit.people,
      ),
    ).toEqual([
      [expect.objectContaining({ amount: priceAmount / 2 })],
      [expect.objectContaining({ amount: priceAmount / 2 })],
    ]);
    expect(
      previews[fixture.seminars[0].id]?.stages.deposit.people[0]?.personName,
    ).toContain("Pérez");

    const result = await paySeminarsPreset({
      now: new Date(),
      academyId: ownerId,
      eventId: fixture.event.id,
      seminarIds: fixture.seminars.map((seminar) => seminar.id),
      stage: "deposit",
    });

    expect(result).toMatchObject({ ok: true });
    expect(
      await readAllocated(
        fixture.event.id,
        fixture.inscriptions.map((row) => row.id),
      ),
    ).toEqual(
      new Map(fixture.inscriptions.map((row) => [row.id, priceAmount / 2])),
    );
  });
});

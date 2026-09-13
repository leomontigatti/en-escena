import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  comprobanteInscriptions,
  comprobantes,
  events,
  paymentAllocations,
  payments,
  seminarInscriptions,
  seminarPrices,
  seminars,
} from "@/db/schema";
import { createDancer } from "@/lib/choreographies/registration-test-fixtures.server.db";
import { createSavedEvent } from "@/lib/events/bases-test-fixtures.server.db";
import { readAcademyAvailableBalance } from "@/lib/finances/allocation-pool.server";
import { applyAllocationDelta } from "@/lib/finances/choreography-cobro-allocations.server";
import { createAcademyUser } from "@/lib/test-support/academies";

import { createAcademyFinanceChoreographyFixture } from "../admin/finances/finances.test-support";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

/**
 * An academy with a payment, and a seminar of its event with one registered
 * dancer and one price row. The event's own deposit rate is deliberately
 * different from the seminar's: every threshold asserted below is the seminar's.
 */
async function seedSeminarTarget(
  options: {
    eventDepositPercentage?: number;
    priceAmount?: number;
    seminarDepositPercentage?: number;
  } = {},
) {
  const event = await createSavedEvent(`Regional ${crypto.randomUUID()}`);
  await db
    .update(events)
    .set({
      requiredDepositPercentage: options.eventDepositPercentage ?? 30,
    })
    .where(eq(events.id, event.id));

  const academy = await createAcademyUser({
    academyName: "Academia Seminarios",
    email: `seminarios.${crypto.randomUUID()}@example.com`,
  });
  const dancer = await createDancer(academy.academyId, {
    firstName: "Ana",
    lastName: "Alonso",
  });

  const [seminar] = await db
    .insert(seminars)
    .values({
      eventId: event.id,
      instructorName: "Abril Sosa",
      kind: "regular",
      quota: 20,
      requiredDepositPercentage: options.seminarDepositPercentage ?? 50,
      scheduledDate: "2030-10-10",
      startTime: "18:30",
    })
    .returning();

  const [price] = await db
    .insert(seminarPrices)
    .values({
      amount: options.priceAmount ?? 20000,
      eventId: event.id,
      forParticipants: true,
      kind: "regular",
      name: "Precio participantes",
      paymentDeadline: null,
    })
    .returning();

  const [otherPrice] = await db
    .insert(seminarPrices)
    .values({
      amount: 30000,
      eventId: event.id,
      forParticipants: false,
      kind: "regular",
      name: "Precio no participantes",
      paymentDeadline: null,
    })
    .returning();

  const [inscription] = await db
    .insert(seminarInscriptions)
    .values({ dancerId: dancer.id, seminarId: seminar.id })
    .returning();

  const [payment] = await db
    .insert(payments)
    .values({
      academyId: academy.academyId,
      amount: 50000,
      eventId: event.id,
      paymentDate: "2030-04-01",
      paymentMethod: "transferencia",
      paymentNumber: 1,
    })
    .returning();

  return {
    academyId: academy.academyId,
    eventId: event.id,
    inscription,
    otherPriceId: otherPrice.id,
    payment,
    priceId: price.id,
    seminarId: seminar.id,
  };
}

async function allocate(
  fixture: Awaited<ReturnType<typeof seedSeminarTarget>>,
  amount: number,
) {
  await db.insert(paymentAllocations).values({
    academyId: fixture.academyId,
    amount,
    eventId: fixture.eventId,
    paymentId: fixture.payment.id,
    seminarInscriptionId: fixture.inscription.id,
  });
}

/** The stored price moves from absent to `priceId`, which nothing guards. */
async function storePrice(inscriptionId: string, priceId: string) {
  await db
    .update(seminarInscriptions)
    .set({ selectedPriceId: priceId })
    .where(eq(seminarInscriptions.id, inscriptionId));
}

/** A choreography of the event: the anchor a comprobante root still needs. */
async function seedChoreographyId(eventId: string) {
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    throw new Error("Expected the event.");
  }

  const { choreography } = await createAcademyFinanceChoreographyFixture({
    academyName: "Academia Coreografias",
    choreographyName: "Coreografia ancla",
    email: `ancla.${crypto.randomUUID()}@example.com`,
    event,
  });

  return choreography.id;
}

async function recordComprobanteRoot(eventId: string, choreographyId: string) {
  const [comprobante] = await db
    .insert(comprobantes)
    .values({
      cae: "74123456789012",
      caeVto: "20300801",
      cbteFch: "20300722",
      cbteNro: 1,
      cbteTipo: 11,
      choreographyId,
      eventId,
      impTotal: 10000,
      issuerCuit: "30717611590",
      issuerIvaCondition: "exento",
      ptoVta: 1,
      receptorDocNro: "0",
      receptorDocTipo: 99,
      receptorIvaConditionId: 5,
    })
    .returning();

  return comprobante;
}

describe.sequential("the allocation target", () => {
  test("refuses a row naming neither inscription and one naming both", async () => {
    const fixture = await seedSeminarTarget();

    await expect(
      db.insert(paymentAllocations).values({
        academyId: fixture.academyId,
        amount: 1000,
        eventId: fixture.eventId,
        paymentId: fixture.payment.id,
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(paymentAllocations).values({
        academyId: fixture.academyId,
        amount: 1000,
        choreographyInscriptionId: fixture.inscription.id,
        eventId: fixture.eventId,
        paymentId: fixture.payment.id,
        seminarInscriptionId: fixture.inscription.id,
      }),
    ).rejects.toThrow();
  });

  test("sums a repeated seminar target onto one row instead of inserting a second", async () => {
    const fixture = await seedSeminarTarget();
    const target = { id: fixture.inscription.id, kind: "seminar" } as const;

    await applyAllocationDelta(db, {
      academyId: fixture.academyId,
      delta: 3000,
      eventId: fixture.eventId,
      paymentId: fixture.payment.id,
      target,
    });
    await applyAllocationDelta(db, {
      academyId: fixture.academyId,
      delta: 4000,
      eventId: fixture.eventId,
      paymentId: fixture.payment.id,
      target,
    });

    const rows = await db
      .select()
      .from(paymentAllocations)
      .where(
        eq(paymentAllocations.seminarInscriptionId, fixture.inscription.id),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(7000);
    expect(rows[0]?.choreographyInscriptionId).toBeNull();

    // The inverse deletes the same row rather than leaving one at zero.
    await applyAllocationDelta(db, {
      academyId: fixture.academyId,
      delta: -7000,
      eventId: fixture.eventId,
      paymentId: fixture.payment.id,
      target,
    });

    await expect(
      db
        .select()
        .from(paymentAllocations)
        .where(
          eq(paymentAllocations.seminarInscriptionId, fixture.inscription.id),
        ),
    ).resolves.toEqual([]);
  });

  test("carries a withdrawal timestamp on the seminar inscription, empty until it is withdrawn", async () => {
    const fixture = await seedSeminarTarget();

    expect(fixture.inscription.withdrawnAt).toBeNull();

    await db
      .update(seminarInscriptions)
      .set({ withdrawnAt: new Date("2030-05-01T12:00:00Z") })
      .where(eq(seminarInscriptions.id, fixture.inscription.id));

    const row = await db.query.seminarInscriptions.findFirst({
      where: eq(seminarInscriptions.id, fixture.inscription.id),
    });
    expect(row?.withdrawnAt).toEqual(new Date("2030-05-01T12:00:00Z"));
  });

  test("keeps `Saldo disponible` independent of which kind the money sits on", async () => {
    const fixture = await seedSeminarTarget();

    await expect(
      readAcademyAvailableBalance(db, {
        academyId: fixture.academyId,
        eventId: fixture.eventId,
      }),
    ).resolves.toBe(50000);

    await allocate(fixture, 12000);

    await expect(
      readAcademyAvailableBalance(db, {
        academyId: fixture.academyId,
        eventId: fixture.eventId,
      }),
    ).resolves.toBe(38000);
  });
});

describe.sequential("the seminar inscription price lock", () => {
  test("lets the stored price move on a row with no money", async () => {
    const fixture = await seedSeminarTarget();

    await storePrice(fixture.inscription.id, fixture.priceId);
    await storePrice(fixture.inscription.id, fixture.otherPriceId);

    const row = await db.query.seminarInscriptions.findFirst({
      where: eq(seminarInscriptions.id, fixture.inscription.id),
    });
    expect(row?.selectedPriceId).toBe(fixture.otherPriceId);
  });

  test("derives the deposit from the seminar's own percentage, not the event's", async () => {
    const fixture = await seedSeminarTarget({
      eventDepositPercentage: 30,
      priceAmount: 20000,
      seminarDepositPercentage: 50,
    });

    await storePrice(fixture.inscription.id, fixture.priceId);
    // 7000 is past the event's 6000 and short of the seminar's 10000, so the
    // price is still free to move.
    await allocate(fixture, 7000);

    await storePrice(fixture.inscription.id, fixture.otherPriceId);

    const row = await db.query.seminarInscriptions.findFirst({
      where: eq(seminarInscriptions.id, fixture.inscription.id),
    });
    expect(row?.selectedPriceId).toBe(fixture.otherPriceId);
  });

  test("refuses moving the stored price once the row covers its deposit", async () => {
    const fixture = await seedSeminarTarget({
      priceAmount: 20000,
      seminarDepositPercentage: 50,
    });

    await storePrice(fixture.inscription.id, fixture.priceId);
    await allocate(fixture, 10000);

    await expect(
      storePrice(fixture.inscription.id, fixture.otherPriceId),
    ).rejects.toThrow();

    const row = await db.query.seminarInscriptions.findFirst({
      where: eq(seminarInscriptions.id, fixture.inscription.id),
    });
    expect(row?.selectedPriceId).toBe(fixture.priceId);
  });

  test("opens again once money comes off below the deposit", async () => {
    const fixture = await seedSeminarTarget({
      priceAmount: 20000,
      seminarDepositPercentage: 50,
    });

    await storePrice(fixture.inscription.id, fixture.priceId);
    await allocate(fixture, 10000);
    await db
      .update(paymentAllocations)
      .set({ amount: 9999 })
      .where(
        and(
          eq(paymentAllocations.seminarInscriptionId, fixture.inscription.id),
          eq(paymentAllocations.paymentId, fixture.payment.id),
        ),
      );

    await storePrice(fixture.inscription.id, fixture.otherPriceId);

    const row = await db.query.seminarInscriptions.findFirst({
      where: eq(seminarInscriptions.id, fixture.inscription.id),
    });
    expect(row?.selectedPriceId).toBe(fixture.otherPriceId);
  });
});

describe.sequential("the comprobante line target", () => {
  test("accepts a line naming nobody and refuses one naming both", async () => {
    const fixture = await seedSeminarTarget();
    const choreographyId = await seedChoreographyId(fixture.eventId);
    const comprobante = await recordComprobanteRoot(
      fixture.eventId,
      choreographyId,
    );

    await db.insert(comprobanteInscriptions).values({
      amount: 10000,
      comprobanteId: comprobante.id,
    });

    await expect(
      db.insert(comprobanteInscriptions).values({
        amount: 10000,
        choreographyInscriptionId: fixture.inscription.id,
        comprobanteId: comprobante.id,
        seminarInscriptionId: fixture.inscription.id,
      }),
    ).rejects.toThrow();
  });

  test("lets two orphaned lines of one comprobante coexist and refuses two for the same seminar inscription", async () => {
    const fixture = await seedSeminarTarget();
    const choreographyId = await seedChoreographyId(fixture.eventId);
    const comprobante = await recordComprobanteRoot(
      fixture.eventId,
      choreographyId,
    );

    await db.insert(comprobanteInscriptions).values([
      { amount: 4000, comprobanteId: comprobante.id },
      { amount: 6000, comprobanteId: comprobante.id },
    ]);

    await db.insert(comprobanteInscriptions).values({
      amount: 5000,
      comprobanteId: comprobante.id,
      seminarInscriptionId: fixture.inscription.id,
    });

    await expect(
      db.insert(comprobanteInscriptions).values({
        amount: 5000,
        comprobanteId: comprobante.id,
        seminarInscriptionId: fixture.inscription.id,
      }),
    ).rejects.toThrow();

    const lines = await db
      .select()
      .from(comprobanteInscriptions)
      .where(eq(comprobanteInscriptions.comprobanteId, comprobante.id));
    expect(lines).toHaveLength(3);
  });
});

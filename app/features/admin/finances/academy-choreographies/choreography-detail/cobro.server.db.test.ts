import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { payments, choreographyDancers, paymentAllocations } from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import { releaseInscriptionAllocations } from "@/lib/finances/choreography-cobro.server";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { action as choreographyDetailAction } from "@/routes/administracion.finanzas_.$academyId_.coreografias_.$choreographyId";

import { installDatabaseTestHooks } from "../../../../../../tests/db/harness";
import {
  createAcademyFinanceChoreographyFixture,
  createSavedEvent,
  createSignedInRequest,
  registerPaymentForTest,
} from "../../../../../lib/admin/finances/finances.test-support";

installDatabaseTestHooks();

// A charge is no longer dated against a payment: it freezes against the
// business day and resolves the price applicable that day. Pinning it inside
// the catalogue's validity keeps the fixture readable and makes the chosen
// price row deterministic.
beforeEach(() => {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

async function seedCobroFixture(paymentAmount = 50000) {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Cobro",
      email: `cobro.${crypto.randomUUID()}@example.com`,
      choreographyName: "Cobro coreografía",
      event,
    });
  const dancerA = await createDancer(academy.academy.id, {
    firstName: "Ana",
    lastName: "Alonso",
  });
  const dancerB = await createDancer(academy.academy.id, {
    firstName: "Bruno",
    lastName: "Benítez",
  });

  await db.insert(choreographyDancers).values([
    {
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancerA.id,
    },
    {
      ageAtEventStart: 15,
      choreographyId: choreography.id,
      dancerId: dancerB.id,
    },
  ]);

  await registerPaymentForTest({
    academyId: academy.academy.id,
    amount: String(paymentAmount),
    eventId: event.id,
    paymentDate: "2026-04-10",
  });
  const payment = await db.query.payments.findFirst({
    where: eq(payments.academyId, academy.academy.id),
  });
  if (!payment) {
    throw new Error("Expected a registered payment.");
  }

  return { academy, choreography, event, payment };
}

async function postDetailAction(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  fields: Record<string, string>;
}) {
  const requestUrl = `http://localhost/administracion/finanzas/${input.academyId}/coreografias/${input.choreographyId}?evento=${input.eventId}`;
  const signedIn = await createSignedInRequest({
    email: `admin.${crypto.randomUUID()}@example.com`,
    role: "admin",
    requestUrl,
  });
  const formData = new FormData();
  for (const [name, value] of Object.entries(input.fields)) {
    formData.set(name, value);
  }

  const request = new Request(requestUrl, {
    method: "POST",
    body: formData,
    headers: {
      cookie: signedIn.request.headers.get("cookie") ?? "",
    },
  });

  try {
    return await choreographyDetailAction({
      request,
      params: {
        academyId: input.academyId,
        choreographyId: input.choreographyId,
      },
      context: {},
    } as never);
  } catch (thrown) {
    // Redirects are thrown as a `Response` (React Router's convention).
    if (thrown instanceof Response) {
      return thrown;
    }
    throw thrown;
  }
}

describe.sequential("choreography cobro through the route action", () => {
  test("Pagar seña freezes deposit snapshots and moves inscriptions to señada", async () => {
    const fixture = await seedCobroFixture();

    const response = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-deposit" },
    });

    expect(response).toMatchObject({ status: 302 });

    const inscriptions = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, fixture.choreography.id),
    });
    expect(inscriptions).toHaveLength(2);
    for (const inscription of inscriptions) {
      expect(inscription.depositReferenceDate).toBe("2026-04-10");
      expect(inscription.depositAmount).toBe(3000);
      expect(inscription.frozenBasePriceAmount).toBe(10000);
      expect(inscription.balanceReferenceDate).toBeNull();
    }

    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.paymentId, fixture.payment.id),
    });
    expect(allocations).toHaveLength(2);
    expect(allocations.every((a) => a.amount === 3000)).toBe(true);
  });

  test("rolls the whole preset back when the pool covers only some inscriptions", async () => {
    // Two inscriptions owing 3000 each, and a pool of 4000: the first is
    // fundable and the second is not. A refusal has to leave nothing behind —
    // neither a partial allocation nor a frozen snapshot.
    const fixture = await seedCobroFixture(4000);

    const result = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-deposit" },
    });

    expect(result).toMatchObject({ status: "error" });

    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.paymentId, fixture.payment.id),
    });
    expect(allocations).toHaveLength(0);

    const inscriptions = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, fixture.choreography.id),
    });
    for (const inscription of inscriptions) {
      expect(inscription.depositReferenceDate).toBeNull();
      expect(inscription.selectedPriceId).toBeNull();
      expect(inscription.frozenBasePriceAmount).toBeNull();
    }
  });

  test("rejects Pagar saldo when an inscription has no deposit", async () => {
    const fixture = await seedCobroFixture();

    const result = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-balance" },
    });

    expect(result).toMatchObject({ status: "error" });
    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.paymentId, fixture.payment.id),
    });
    expect(allocations).toHaveLength(0);
  });

  test("Pagar saldo freezes balance snapshots and moves inscriptions to pagada", async () => {
    const fixture = await seedCobroFixture();

    await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-deposit" },
    });
    const balanceResponse = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-balance" },
    });

    expect(balanceResponse).toMatchObject({ status: 302 });

    const inscriptions = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, fixture.choreography.id),
    });
    for (const inscription of inscriptions) {
      expect(inscription.balanceReferenceDate).toBe("2026-04-10");
      expect(inscription.balanceAmount).toBe(7000);
      expect(inscription.finalTotalAmount).toBe(10000);
    }

    // Two inscriptions, one payment: two rows, each with the deposit and the
    // balance summed onto it.
    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.paymentId, fixture.payment.id),
    });
    expect(allocations).toHaveLength(2);
    expect(allocations.every((a) => a.amount === 10000)).toBe(true);
  });

  test("la seña y el saldo del mismo pago viven en una sola asignación", async () => {
    const fixture = await seedCobroFixture();

    await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-deposit" },
    });
    await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-balance" },
    });

    const inscription = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.choreographyId, fixture.choreography.id),
    });
    if (!inscription) {
      throw new Error("Expected an inscription.");
    }

    // One row per (payment, inscription): the balance summed onto the deposit.
    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.inscriptionId, inscription.id),
    });
    expect(allocations).toHaveLength(1);
    expect(allocations[0]?.amount).toBe(10000);
  });

  test("releaseInscriptionAllocations returns everything allocated to the available balance", async () => {
    const fixture = await seedCobroFixture();

    await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-deposit" },
    });

    const inscription = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.choreographyId, fixture.choreography.id),
    });
    if (!inscription) {
      throw new Error("Expected an inscription.");
    }

    const { releasedAmount } = await releaseInscriptionAllocations({
      inscriptionId: inscription.id,
    });

    expect(releasedAmount).toBe(3000);
    const remaining = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.inscriptionId, inscription.id),
    });
    expect(remaining).toHaveLength(0);

    const reloaded = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, inscription.id),
    });
    expect(reloaded?.depositReferenceDate).toBeNull();
    expect(reloaded?.depositAmount).toBeNull();
  });
});

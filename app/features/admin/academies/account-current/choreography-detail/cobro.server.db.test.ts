import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academyEventPayments,
  choreographyDancers,
  paymentAllocations,
} from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import { releaseInscriptionAllocations } from "@/lib/finances/choreography-cobro.server";
import { action as choreographyDetailAction } from "@/routes/administracion.finanzas_.$academyId_.coreografias_.$choreographyId";

import { installDatabaseTestHooks } from "../../../../../../tests/db/harness";
import {
  createAccountCurrentChoreographyFixture,
  createSavedEvent,
  createSignedInRequest,
  registerPaymentForTest,
} from "../../../../../lib/admin/academies/account-current-route.test-support";

installDatabaseTestHooks();

async function seedCobroFixture() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, choreography } =
    await createAccountCurrentChoreographyFixture({
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
    amount: "50000",
    eventId: event.id,
    paymentDate: "2026-04-10",
  });
  const payment = await db.query.academyEventPayments.findFirst({
    where: eq(academyEventPayments.academyId, academy.academy.id),
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
    // Los redirects se lanzan como `Response` (convención de React Router).
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
      fields: { intent: "pay-deposit", paymentId: fixture.payment.id },
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
    expect(allocations.every((a) => a.allocationType === "deposit")).toBe(true);
  });

  test("rejects Pagar saldo when an inscription has no deposit", async () => {
    const fixture = await seedCobroFixture();

    const result = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-balance", paymentId: fixture.payment.id },
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
      fields: { intent: "pay-deposit", paymentId: fixture.payment.id },
    });
    const balanceResponse = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-balance", paymentId: fixture.payment.id },
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

    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.paymentId, fixture.payment.id),
    });
    expect(allocations).toHaveLength(4);
  });

  test("deleting the balance allocation returns the inscription to señada", async () => {
    const fixture = await seedCobroFixture();

    await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-deposit", paymentId: fixture.payment.id },
    });
    await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-balance", paymentId: fixture.payment.id },
    });

    const balanceAllocation = await db.query.paymentAllocations.findFirst({
      where: eq(paymentAllocations.allocationType, "balance"),
    });
    if (!balanceAllocation) {
      throw new Error("Expected a balance allocation.");
    }

    const response = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: {
        intent: "delete-allocation",
        allocationId: balanceAllocation.id,
      },
    });

    expect(response).toMatchObject({ status: 302 });
    const inscription = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, balanceAllocation.inscriptionId),
    });
    expect(inscription?.balanceReferenceDate).toBeNull();
    expect(inscription?.balanceAmount).toBeNull();
    expect(inscription?.depositReferenceDate).toBe("2026-04-10");
  });

  test("releaseInscriptionAllocations returns everything allocated to the available balance", async () => {
    const fixture = await seedCobroFixture();

    await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-deposit", paymentId: fixture.payment.id },
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

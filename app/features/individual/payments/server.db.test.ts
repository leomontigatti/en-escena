import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { payments } from "@/db/schema";
import { loadIndividualPayments } from "@/features/individual/payments/server";
import { individualMovementsPath } from "@/features/individual/payments/shared";
import {
  createAcademySession,
  expectThrownResponse,
} from "@/features/portal/test-support/db";
import { activateEvent, updateEvent } from "@/lib/events/management.server";
import { registerRefund } from "@/lib/finances/refunds.server";
import { createSavedEvent } from "@/lib/test-support/events";
import { createIndividualUser } from "@/lib/test-support/individuals";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

const pageUrl = `http://localhost${individualMovementsPath}`;

async function createActiveEvent() {
  const event = await createSavedEvent({
    active: false,
    name: "Regional 2026",
  });
  await activateEvent(event.id);

  return event;
}

function createIndividual() {
  return createIndividualUser({
    email: `${crypto.randomUUID()}@example.com`,
    firstName: "Clara",
    lastName: "Ríos",
  });
}

function load(cookie: string) {
  return loadIndividualPayments(new Request(pageUrl, { headers: { cookie } }));
}

describe("the individual's `Movimientos`", () => {
  test("reads the payments and refunds administration recorded for it, and nobody else's", async () => {
    const event = await createActiveEvent();
    const individual = await createIndividual();
    const academy = await createAcademySession({
      academyName: "Academia Norte",
      email: `${crypto.randomUUID()}@example.com`,
    });
    await db.insert(payments).values([
      {
        academyId: individual.ownerId,
        amount: 5000,
        eventId: event.id,
        paymentDate: "2026-04-02",
        paymentMethod: "efectivo",
        paymentNumber: 900,
      },
      {
        academyId: academy.academyId,
        amount: 9000,
        eventId: event.id,
        paymentDate: "2026-04-02",
        paymentMethod: "efectivo",
        paymentNumber: 901,
      },
    ]);
    for (const [academyId, amount] of [
      [individual.ownerId, 1500],
      [academy.academyId, 2500],
    ] as const) {
      const refunded = await registerRefund({
        academyId,
        amount,
        eventId: event.id,
        internalNote: "Nota interna del reembolso",
        reference: "DEV-1",
        refundDate: "2026-04-03",
        refundMethod: "transferencia",
      });
      expect(refunded.ok).toBe(true);
    }

    const loaderData = await load(individual.cookie);

    // Exact rows: an internal note would show as a key of its own.
    expect(loaderData.movements).toEqual([
      {
        amount: 1500,
        date: "2026-04-03",
        id: expect.any(String),
        kind: "refund",
        method: "transferencia",
        number: 1,
        reference: "DEV-1",
      },
      {
        amount: 5000,
        date: "2026-04-02",
        id: expect.any(String),
        kind: "payment",
        method: "efectivo",
        number: 900,
        reference: null,
      },
    ]);
  });

  // The individual pays like an academy, so it reads the same `Instrucciones
  // de pago` the portal's `Movimientos` shows.
  test("reads the active event's payment instructions", async () => {
    const event = await createActiveEvent();
    const result = await updateEvent(event.id, {
      endsAt: event.endsAt,
      name: event.name,
      paymentInstructionsAlias: "mi.alias-01",
      paymentInstructionsCbu: "0070099330004512345678",
      paymentInstructionsText: "Poné tu nombre en la referencia.",
      requiredDepositPercentage: event.requiredDepositPercentage,
      startsAt: event.startsAt,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const individual = await createIndividual();

    const loaderData = await load(individual.cookie);

    expect(loaderData.paymentInstructions).toMatchObject({
      alias: "mi.alias-01",
      cbu: "0070099330004512345678",
      text: "Poné tu nombre en la referencia.",
    });
  });

  test("reads nothing without an active event", async () => {
    const individual = await createIndividual();

    await expect(load(individual.cookie)).resolves.toEqual({
      activeEvent: null,
      paymentInstructions: null,
      movements: [],
    });
  });

  test("is an individual's page only", async () => {
    const academy = await createAcademySession({
      academyName: "Academia Norte",
      email: `${crypto.randomUUID()}@example.com`,
    });

    await expectThrownResponse(load(academy.cookie), 403);
  });
});

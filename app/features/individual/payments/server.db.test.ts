import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { payments } from "@/db/schema";
import { loadIndividualPayments } from "@/features/individual/payments/server";
import { individualPaymentsPath } from "@/features/individual/payments/shared";
import {
  createAcademySession,
  expectThrownResponse,
} from "@/features/portal/test-support/db";
import { activateEvent, updateEvent } from "@/lib/events/management.server";
import { createSavedEvent } from "@/lib/test-support/events";
import { createIndividualUser } from "@/lib/test-support/individuals";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

const pageUrl = `http://localhost${individualPaymentsPath}`;

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

describe("the individual's `Pagos`", () => {
  test("reads the payments administration recorded for it, and nobody else's", async () => {
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

    const loaderData = await load(individual.cookie);

    expect(loaderData.payments.map((payment) => payment.amount)).toEqual([
      5000,
    ]);
  });

  // The individual pays like an academy, so it reads the same `Instrucciones
  // de pago` the portal's `Pagos` shows.
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
      payments: [],
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

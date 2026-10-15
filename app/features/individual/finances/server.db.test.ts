import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { payments, seminarInscriptions } from "@/db/schema";
import { loadIndividualFinances } from "@/features/individual/finances/server";
import { individualFinancesPath } from "@/features/individual/finances/shared";
import {
  createAcademySession,
  expectThrownResponse,
} from "@/features/portal/test-support/db";
import { activateEvent } from "@/lib/events/management.server";
import { createSeminarRegistrationPrices } from "@/lib/seminar-prices/seminar-prices.test-support";
import { createSeminar } from "@/lib/seminars/repository.server";
import { coverSeminarInscriptionDeposit } from "@/lib/seminars/seminars.test-support";
import { createSavedEvent } from "@/lib/test-support/events";
import { createIndividualUser } from "@/lib/test-support/individuals";
import { defaultSeminarFacts } from "@/lib/test-support/seminars";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

const pageUrl = `http://localhost${individualFinancesPath}`;

async function createActiveEvent() {
  const event = await createSavedEvent({
    active: false,
    name: "Regional 2026",
  });
  await activateEvent(event.id);
  await createSeminarRegistrationPrices(event.id);

  return event;
}

async function addSeminar(eventId: string, instructorName: string) {
  const result = await createSeminar(eventId, {
    instructorName,
    scheduledDate: "2030-10-10",
    startTime: "18:30",
    quota: 5,
    ...defaultSeminarFacts,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.seminar;
}

function createIndividual() {
  return createIndividualUser({
    email: `${crypto.randomUUID()}@example.com`,
    firstName: "Clara",
    lastName: "Ríos",
  });
}

function load(cookie: string) {
  return loadIndividualFinances(new Request(pageUrl, { headers: { cookie } }));
}

describe("the individual's Finanzas", () => {
  test("reads its inscriptions with status and its `Saldo disponible`", async () => {
    const event = await createActiveEvent();
    const covered = await addSeminar(event.id, "Abril Sosa");
    const pending = await addSeminar(event.id, "Bruno Díaz");
    const individual = await createIndividual();
    const [coveredInscription] = await db
      .insert(seminarInscriptions)
      .values(
        [covered, pending].map((seminar) => ({
          individualId: individual.individualId,
          seminarId: seminar.id,
        })),
      )
      .returning();
    await coverSeminarInscriptionDeposit({
      academyId: individual.ownerId,
      eventId: event.id,
      inscriptionId: coveredInscription.id,
      seminarId: covered.id,
    });
    // Money paid and not placed yet: it is the `Saldo disponible`.
    await db.insert(payments).values({
      academyId: individual.ownerId,
      amount: 5000,
      eventId: event.id,
      paymentDate: "2026-04-02",
      paymentMethod: "efectivo",
      paymentNumber: 900,
    });

    const loaderData = await load(individual.cookie);

    expect(loaderData.activeEvent?.id).toBe(event.id);
    expect(loaderData.summary.availableBalanceAmount).toBe(5000);
    expect(
      loaderData.seminarFinanceRows
        .map((row) => ({
          financialStatus: row.financialStatus,
          instructorName: row.instructorName,
        }))
        .sort((a, b) => a.instructorName.localeCompare(b.instructorName)),
    ).toEqual([
      { financialStatus: "depositMet", instructorName: "Abril Sosa" },
      { financialStatus: "depositPending", instructorName: "Bruno Díaz" },
    ]);
  });

  test("shows nobody else's money", async () => {
    const event = await createActiveEvent();
    const individual = await createIndividual();
    const academy = await createAcademySession({
      academyName: "Academia Norte",
      email: `${crypto.randomUUID()}@example.com`,
    });
    await db.insert(payments).values({
      academyId: academy.academyId,
      amount: 9000,
      eventId: event.id,
      paymentDate: "2026-04-02",
      paymentMethod: "efectivo",
      paymentNumber: 901,
    });

    const loaderData = await load(individual.cookie);

    expect(loaderData.summary.availableBalanceAmount).toBe(0);
  });

  test("reads nothing without an active event", async () => {
    const individual = await createIndividual();

    await expect(load(individual.cookie)).resolves.toEqual({
      activeEvent: null,
      seminarFinanceRows: [],
      summary: {
        availableBalanceAmount: 0,
        depositAmount: { amount: 0, status: "complete" },
        owedBalanceAmount: { amount: 0, status: "complete" },
        owedDepositAmount: { amount: 0, status: "complete" },
        totalAmount: { amount: 0, status: "complete" },
        totalPaidAmount: 0,
      },
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

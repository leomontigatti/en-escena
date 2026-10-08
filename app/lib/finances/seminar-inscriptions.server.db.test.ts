import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { seminarInscriptions } from "@/db/schema";
import { createDancer } from "@/lib/choreographies/registration-test-fixtures.server.db";
import { allocateToSeminarInscription } from "@/lib/finances/seminar-inscription-allocation.server";
import { readSeminarInscriptionFinanceRows } from "@/lib/finances/seminar-inscriptions.server";
import { createSeminar } from "@/lib/seminars/repository.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";
import { createInactiveEvent } from "../admin/finances/finances.test-support";
import { seedEventSeminarFinanceFixture } from "../admin/finances/seminar-finances.test-support";

installDatabaseTestHooks();

describe("readSeminarInscriptionFinanceRows", () => {
  test("reads every seminar inscription of the event, each with its academy and its seminar", async () => {
    const fixture = await seedEventSeminarFinanceFixture();
    await seedInscriptionInAnotherEvent(fixture.northAcademyId);
    await allocateToSeminarInscription({
      academyId: fixture.northAcademyId,
      amount: 10000,
      eventId: fixture.eventId,
      inscriptionId: fixture.anaInscriptionId,
      priceId: fixture.priceId,
      seminarId: fixture.abrilSeminarId,
    });

    const rows = await readSeminarInscriptionFinanceRows({
      eventId: fixture.eventId,
    });

    expect(
      rows.map((row) => ({
        academyId: row.academyId,
        academyName: row.academyName,
        allocatedAmount: row.allocatedAmount,
        financialStatus: row.financialStatus,
        inscriptionId: row.inscriptionId,
        instructorName: row.instructorName,
        name: `${row.firstName} ${row.lastName}`,
        owedBalanceAmount: row.owedBalanceAmount,
        scheduledDate: row.scheduledDate,
        seminarId: row.seminarId,
      })),
    ).toEqual([
      {
        academyId: fixture.northAcademyId,
        academyName: "Academia Norte",
        allocatedAmount: 10000,
        financialStatus: "depositMet",
        inscriptionId: fixture.anaInscriptionId,
        instructorName: "Abril Sosa",
        name: "Ana López",
        owedBalanceAmount: 10000,
        scheduledDate: "2099-10-10",
        seminarId: fixture.abrilSeminarId,
      },
      {
        academyId: fixture.northAcademyId,
        academyName: "Academia Norte",
        allocatedAmount: 0,
        financialStatus: "depositPending",
        inscriptionId: fixture.nicolasInscriptionId,
        instructorName: "Bruno Díaz",
        name: "Nicolás Prado",
        owedBalanceAmount: 20000,
        scheduledDate: "2099-10-11",
        seminarId: fixture.brunoSeminarId,
      },
      // A professor: the academy is read through whichever person the
      // inscription names.
      {
        academyId: fixture.southAcademyId,
        academyName: "Academia Sur",
        allocatedAmount: 0,
        financialStatus: "depositPending",
        inscriptionId: fixture.luzInscriptionId,
        instructorName: "Bruno Díaz",
        name: "Luz Suárez",
        owedBalanceAmount: 20000,
        scheduledDate: "2099-10-11",
        seminarId: fixture.brunoSeminarId,
      },
    ]);
  });

  test("narrows to one `(seminar, academy)` pair when both are named", async () => {
    const fixture = await seedEventSeminarFinanceFixture();

    const rows = await readSeminarInscriptionFinanceRows({
      academyId: fixture.southAcademyId,
      eventId: fixture.eventId,
      seminarId: fixture.brunoSeminarId,
    });

    expect(rows.map((row) => row.inscriptionId)).toEqual([
      fixture.luzInscriptionId,
    ]);
  });
});

/** A seminar of an inactive event with one inscription of the same academy:
 * what the event-wide read has to leave out. */
async function seedInscriptionInAnotherEvent(academyId: string) {
  const otherEvent = await createInactiveEvent("En Escena 2025");
  const created = await createSeminar(otherEvent.id, {
    instructorName: "Carla Ríos",
    kind: "regular",
    quota: 10,
    requiredDepositPercentage: 50,
    scheduledDate: "2099-09-09",
    startTime: "18:30",
  });

  if (!created.ok) {
    throw new Error(created.error);
  }

  const dancer = await createDancer(academyId, {
    firstName: "Zoe",
    lastName: "Otro",
  });

  await db
    .insert(seminarInscriptions)
    .values({ dancerId: dancer.id, seminarId: created.seminar.id });
}

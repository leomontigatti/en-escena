import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  allocateToSeminarInscription,
  removeFromSeminarInscription,
} from "@/lib/finances/seminar-inscription-allocation.server";
import { removeSeminarInscriptionFromRoster } from "@/lib/seminars/inscription-withdrawal.server";
import { loader } from "@/routes/administracion.finanzas_.seminarios";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";
import { createSignedInRequest } from "../../../../lib/admin/finances/finances.test-support";
import {
  seedEventSeminarFinanceFixture,
  seminarInscriptionFinancesUrl,
  type EventSeminarFinanceFixture,
} from "../../../../lib/admin/finances/seminar-finances.test-support";

installDatabaseTestHooks();

describe("`/administracion/finanzas/seminarios`", () => {
  test("lists every seminar inscription of the event with the prices its dialog offers", async () => {
    const fixture = await seedEventSeminarFinanceFixture();

    const loaderData = await load(fixture);

    expect(
      loaderData.inscriptions.map((row) => ({
        academyName: row.academyName,
        inscriptionId: row.inscriptionId,
        instructorName: row.instructorName,
      })),
    ).toEqual([
      {
        academyName: "Academia Norte",
        inscriptionId: fixture.anaInscriptionId,
        instructorName: "Abril Sosa",
      },
      {
        academyName: "Academia Norte",
        inscriptionId: fixture.nicolasInscriptionId,
        instructorName: "Bruno Díaz",
      },
      {
        academyName: "Academia Sur",
        inscriptionId: fixture.luzInscriptionId,
        instructorName: "Bruno Díaz",
      },
    ]);
    expect(
      loaderData.priceOptionsByInscription[fixture.luzInscriptionId],
    ).toEqual([
      {
        amount: 20000,
        depositAmount: 10000,
        id: fixture.priceId,
        name: "No participante general",
      },
    ]);
  });

  test("keeps a withdrawn inscription while it holds money and drops it once it holds none", async () => {
    const fixture = await seedEventSeminarFinanceFixture();
    await allocate(fixture, fixture.anaInscriptionId, fixture.abrilSeminarId);
    await allocate(
      fixture,
      fixture.nicolasInscriptionId,
      fixture.brunoSeminarId,
    );
    await removeSeminarInscriptionFromRoster(db, fixture.anaInscriptionId);
    await removeSeminarInscriptionFromRoster(db, fixture.nicolasInscriptionId);
    await removeFromSeminarInscription({
      academyId: fixture.northAcademyId,
      amount: 5000,
      eventId: fixture.eventId,
      inscriptionId: fixture.nicolasInscriptionId,
      seminarId: fixture.brunoSeminarId,
    });

    const loaderData = await load(fixture);

    expect(
      loaderData.inscriptions.map((row) => ({
        inscriptionId: row.inscriptionId,
        withdrawn: row.withdrawn,
      })),
    ).toEqual([
      { inscriptionId: fixture.anaInscriptionId, withdrawn: true },
      { inscriptionId: fixture.luzInscriptionId, withdrawn: false },
    ]);
  });

  test("refuses the auditor", async () => {
    const fixture = await seedEventSeminarFinanceFixture();
    const { request } = await createSignedInRequest({
      email: "auditor.seminarios@example.com",
      role: "auditor",
      requestUrl: seminarInscriptionFinancesUrl(fixture.eventId),
    });

    await expect(loader(routeArgs(request))).rejects.toMatchObject({
      status: 403,
    });
  });
});

async function load(fixture: EventSeminarFinanceFixture) {
  const { request } = await createSignedInRequest({
    email: `admin.${crypto.randomUUID()}@example.com`,
    role: "admin",
    requestUrl: seminarInscriptionFinancesUrl(fixture.eventId),
  });

  return await loader(routeArgs(request));
}

async function allocate(
  fixture: EventSeminarFinanceFixture,
  inscriptionId: string,
  seminarId: string,
) {
  const result = await allocateToSeminarInscription({
    academyId: fixture.northAcademyId,
    amount: 5000,
    eventId: fixture.eventId,
    inscriptionId,
    priceId: fixture.priceId,
    seminarId,
  });

  if (!result.ok) {
    throw new Error(result.message);
  }
}

function routeArgs(request: Request) {
  return {
    context: {},
    params: {},
    pattern: "/administracion/finanzas/seminarios",
    request,
    url: new URL(request.url),
  };
}

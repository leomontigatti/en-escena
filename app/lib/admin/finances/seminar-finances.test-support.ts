import { db } from "@/db";
import { payments, seminarInscriptions, seminarPrices } from "@/db/schema";
import {
  createDancer,
  createProfessor,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import { createSeminar } from "@/lib/seminars/repository.server";

import {
  createAcademyUser,
  createSavedEvent,
  createSignedInRequest,
} from "./finances.test-support";

/**
 * Two academies with seminar inscriptions and nothing else in the active event:
 * no choreography, and a payment for the north academy alone. The south
 * academy's only tie to the event is a professor registered in a seminar, which
 * is the case the finances list used to miss.
 *
 * Both seminars charge a 50 % deposit off one `No participante general` row, so
 * every inscription's deposit is 10.000 and its total 20.000.
 */
export async function seedEventSeminarFinanceFixture() {
  const event = await createSavedEvent();
  const north = await createAcademyUser({
    academyName: "Academia Norte",
    email: `norte.${crypto.randomUUID()}@example.com`,
  });
  const south = await createAcademyUser({
    academyName: "Academia Sur",
    email: `sur.${crypto.randomUUID()}@example.com`,
  });

  const [price] = await db
    .insert(seminarPrices)
    .values({
      amount: 20000,
      eventId: event.id,
      forParticipants: false,
      kind: "regular",
      name: "No participante general",
      paymentDeadline: null,
    })
    .returning();

  const abril = await createFixtureSeminar(event.id, {
    instructorName: "Abril Sosa",
    scheduledDate: "2099-10-10",
  });
  const bruno = await createFixtureSeminar(event.id, {
    instructorName: "Bruno Díaz",
    scheduledDate: "2099-10-11",
  });

  const ana = await createDancer(north.academy.id, {
    firstName: "Ana",
    lastName: "López",
  });
  const nicolas = await createDancer(north.academy.id, {
    firstName: "Nicolás",
    lastName: "Prado",
  });
  const luz = await createProfessor(south.academy.id, {
    firstName: "Luz",
    lastName: "Suárez",
  });

  const [anaInAbril, nicolasInBruno, luzInBruno] = await db
    .insert(seminarInscriptions)
    .values([
      { dancerId: ana.id, seminarId: abril.id },
      { dancerId: nicolas.id, seminarId: bruno.id },
      { professorId: luz.id, seminarId: bruno.id },
    ])
    .returning();

  await db.insert(payments).values({
    academyId: north.academy.id,
    amount: 50000,
    eventId: event.id,
    paymentDate: "2026-04-01",
    paymentMethod: "transferencia",
    paymentNumber: 1,
  });

  return {
    abrilSeminarId: abril.id,
    anaInscriptionId: anaInAbril!.id,
    brunoSeminarId: bruno.id,
    eventId: event.id,
    luzInscriptionId: luzInBruno!.id,
    nicolasInscriptionId: nicolasInBruno!.id,
    northAcademyId: north.academy.id,
    priceId: price!.id,
    southAcademyId: south.academy.id,
  };
}

export type EventSeminarFinanceFixture = Awaited<
  ReturnType<typeof seedEventSeminarFinanceFixture>
>;

async function createFixtureSeminar(
  eventId: string,
  input: { instructorName: string; scheduledDate: string },
) {
  const created = await createSeminar(eventId, {
    ...input,
    kind: "regular",
    quota: 10,
    requiredDepositPercentage: 50,
    startTime: "18:30",
  });

  if (!created.ok) {
    throw new Error(created.error);
  }

  return created.seminar;
}

export function seminarInscriptionFinancesUrl(eventId: string) {
  return `http://localhost/administracion/finanzas/seminarios?evento=${eventId}`;
}

export function seminarFinanceDetailRequestUrl(input: {
  academyId: string;
  eventId: string;
  seminarId: string;
}) {
  return `http://localhost/administracion/finanzas/${input.academyId}/seminarios/${input.seminarId}?evento=${input.eventId}`;
}

/**
 * A money dialog post, signed in as `role`: the hidden fields the dialog
 * carries (`intent`, `inscriptionId`, `targetKind`) plus whatever it read.
 */
export async function buildSeminarMoneyPostRequest(input: {
  fields: Record<string, string>;
  role?: "admin" | "auditor";
  url: string;
}) {
  const signedIn = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: input.role ?? "admin",
    requestUrl: input.url,
  });
  const formData = new FormData();

  for (const [name, value] of Object.entries({
    targetKind: "seminar",
    ...input.fields,
  })) {
    formData.set(name, value);
  }

  return new Request(input.url, {
    body: formData,
    headers: { cookie: signedIn.request.headers.get("cookie") ?? "" },
    method: "POST",
  });
}

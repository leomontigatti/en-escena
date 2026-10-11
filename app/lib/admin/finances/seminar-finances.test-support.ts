import { db } from "@/db";
import {
  choreographyDancers,
  payments,
  seminarInscriptions,
  seminarPrices,
  seminars,
} from "@/db/schema";
import { createAcademyFinanceChoreographyFixture } from "@/lib/admin/finances/finances.test-support";
import {
  createDancer,
  createProfessor,
} from "@/lib/choreographies/registration.test-support";
import { createSeminar } from "@/lib/seminars/repository.server";

import { createSignedInRequest } from "@/lib/test-support/auth";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSavedEvent } from "@/lib/test-support/events";

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

/**
 * Two seminars of one event — an `Exclusivo` one and a `Común` one — with a full
 * four-cell price list plus two dated rows: an expired one that must never apply
 * and an early-bird one still open. One academy holds a participant and a
 * non-participant in each seminar, and a withdrawn third person in the `Común`
 * one; another academy holds a person in the `Exclusivo` one.
 */
export async function seedSeminarPresetFixture(input: {
  paymentAmount: number;
}) {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const academy = await createAcademyFinanceChoreographyFixture({
    academyName: "Academia Bailando",
    choreographyName: "Aire",
    email: `bailando.${crypto.randomUUID()}@example.com`,
    event,
  });
  const other = await createAcademyFinanceChoreographyFixture({
    academyName: "Academia Vecina",
    catalog: academy.catalog,
    choreographyName: "Brisa",
    email: `vecina.${crypto.randomUUID()}@example.com`,
    event,
  });
  const academyId = academy.academy.academy.id;
  const participant = await createDancer(academyId, {
    firstName: "Ana",
    lastName: "Bailando",
  });
  const outsider = await createDancer(academyId, {
    firstName: "Bruno",
    lastName: "Mirando",
  });
  const leaver = await createDancer(academyId, {
    firstName: "Carla",
    lastName: "Retirada",
  });
  const neighbour = await createDancer(other.academy.academy.id, {
    firstName: "Dora",
    lastName: "Vecina",
  });

  await db.insert(choreographyDancers).values({
    ageAtEventStart: 14,
    choreographyId: academy.choreography.id,
    dancerId: participant.id,
  });

  const [special, regular] = await db
    .insert(seminars)
    .values([
      {
        eventId: event.id,
        instructorName: "Abril Sosa",
        kind: "special" as const,
        quota: 20,
        requiredDepositPercentage: 50,
        scheduledDate: "2030-10-10",
        startTime: "18:30",
      },
      {
        eventId: event.id,
        instructorName: "Nicolás Prado",
        kind: "regular" as const,
        quota: 20,
        requiredDepositPercentage: 50,
        scheduledDate: "2030-10-11",
        startTime: "10:00",
      },
    ])
    .returning();

  const priceRows = await db
    .insert(seminarPrices)
    .values([
      ...(
        [
          ["regular", true, 20000],
          ["regular", false, 30000],
          ["special", true, 40000],
          ["special", false, 50000],
        ] as const
      ).map(([kind, forParticipants, amount]) => ({
        amount,
        eventId: event.id,
        forParticipants,
        kind,
        name: `${kind} ${forParticipants ? "participante" : "no participante"}`,
        paymentDeadline: null,
      })),
      // Still open, so it is what a non-participant of an `Exclusivo` seminar
      // is charged today.
      {
        amount: 44000,
        eventId: event.id,
        forParticipants: false,
        kind: "special" as const,
        name: "Preventa exclusiva",
        paymentDeadline: "2099-12-31",
      },
      // Cheaper, but its deadline has passed: today's resolution skips it.
      {
        amount: 2000,
        eventId: event.id,
        forParticipants: false,
        kind: "regular" as const,
        name: "Preventa vencida",
        paymentDeadline: "2020-01-01",
      },
    ])
    .returning();
  const earlyBirdId = priceRows.find(
    (row) => row.name === "Preventa exclusiva",
  )!.id;
  const expiredPriceId = priceRows.find(
    (row) => row.name === "Preventa vencida",
  )!.id;
  const priceId = (kind: "regular" | "special", forParticipants: boolean) =>
    priceRows.find(
      (row) =>
        row.kind === kind &&
        row.forParticipants === forParticipants &&
        row.paymentDeadline === null,
    )!.id;

  const [
    specialParticipant,
    specialOutsider,
    regularParticipant,
    regularOutsider,
    regularLeaver,
    specialNeighbour,
  ] = await db
    .insert(seminarInscriptions)
    .values([
      { dancerId: participant.id, seminarId: special!.id },
      { dancerId: outsider.id, seminarId: special!.id },
      { dancerId: participant.id, seminarId: regular!.id },
      { dancerId: outsider.id, seminarId: regular!.id },
      {
        dancerId: leaver.id,
        seminarId: regular!.id,
        withdrawnAt: new Date("2030-04-01T12:00:00Z"),
      },
      { dancerId: neighbour.id, seminarId: special!.id },
    ])
    .returning();

  await db.insert(payments).values({
    academyId,
    amount: input.paymentAmount,
    eventId: event.id,
    paymentDate: "2030-04-01",
    paymentMethod: "transferencia",
    paymentNumber: 1,
  });

  return {
    academyId,
    earlyBirdId,
    eventId: event.id,
    expiredPriceId,
    inscriptions: {
      regularLeaver: regularLeaver!,
      regularOutsider: regularOutsider!,
      regularParticipant: regularParticipant!,
      specialNeighbour: specialNeighbour!,
      specialOutsider: specialOutsider!,
      specialParticipant: specialParticipant!,
    },
    priceId,
    regular: regular!,
    special: special!,
  };
}

export type SeminarPresetFixture = Awaited<
  ReturnType<typeof seedSeminarPresetFixture>
>;

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

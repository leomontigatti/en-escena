import { describe, expect, test } from "vitest";

import {
  handleIndividualSeminarsAction,
  loadIndividualSeminars,
} from "@/features/individual/seminars/server";
import {
  deleteIndividualSeminarInscriptionIntent,
  individualSeminarsPath,
  registerIndividualSeminarInscriptionIntent,
} from "@/features/individual/seminars/shared";
import {
  createAcademySession,
  createPortalPostRequest,
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

const pageUrl = `http://localhost${individualSeminarsPath}`;

/** `createSeminarRegistrationPrices`: 20.000 for participants, 30.000 for
 * everyone else, which is what an individual pays until its link says
 * otherwise. */
const ordinaryPrice = 30000;

async function createActiveEvent() {
  const event = await createSavedEvent({
    active: false,
    name: "Regional 2026",
  });
  await activateEvent(event.id);
  await createSeminarRegistrationPrices(event.id);

  return event;
}

async function addSeminar(
  eventId: string,
  input: { instructorName: string; scheduledDate: string; quota?: number },
) {
  const result = await createSeminar(eventId, {
    instructorName: input.instructorName,
    scheduledDate: input.scheduledDate,
    startTime: "18:30",
    quota: input.quota ?? 5,
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
  return loadIndividualSeminars(new Request(pageUrl, { headers: { cookie } }));
}

function register(cookie: string, seminarId: string) {
  const body = new FormData();

  body.set("intent", registerIndividualSeminarInscriptionIntent);
  body.set("seminarId", seminarId);

  return handleIndividualSeminarsAction(
    createPortalPostRequest(pageUrl, cookie, body),
  );
}

function remove(cookie: string, inscriptionId: string) {
  const body = new FormData();

  body.set("intent", deleteIndividualSeminarInscriptionIntent);
  body.set("id", inscriptionId);
  body.set("confirmDeletion", inscriptionId);

  return handleIndividualSeminarsAction(
    createPortalPostRequest(pageUrl, cookie, body),
  );
}

async function readInscriptionId(cookie: string, seminarId: string) {
  const data = await load(cookie);
  const id = data.seminars.find((seminar) => seminar.id === seminarId)
    ?.inscription?.id;

  if (!id) {
    throw new Error("Expected the individual to hold an inscription.");
  }

  return id;
}

describe("the individual's `Seminarios`", () => {
  test("lists the active event's seminars by date with the ordinary price", async () => {
    const event = await createActiveEvent();
    const later = await addSeminar(event.id, {
      instructorName: "Julio Bocca",
      scheduledDate: "2099-10-11",
    });
    const earlier = await addSeminar(event.id, {
      instructorName: "Alicia Alonso",
      scheduledDate: "2099-10-10",
    });
    const individual = await createIndividual();

    await expect(load(individual.cookie)).resolves.toEqual({
      hasActiveEvent: true,
      hasRegistrationPrices: true,
      seminars: [
        {
          id: earlier.id,
          instructorName: "Alicia Alonso",
          scheduledDate: "2099-10-10",
          startTime: "18:30",
          priceAmount: ordinaryPrice,
          hasStarted: false,
          isFull: false,
          startsBeforePaymentDeadline: false,
          inscription: null,
        },
        expect.objectContaining({ id: later.id, inscription: null }),
      ],
    });
  });

  test("reads nothing without an active event", async () => {
    const individual = await createIndividual();

    await expect(load(individual.cookie)).resolves.toEqual({
      hasActiveEvent: false,
      hasRegistrationPrices: false,
      seminars: [],
    });
  });

  test("registers the individual, shows its status and refuses a second inscription", async () => {
    const event = await createActiveEvent();
    const seminar = await addSeminar(event.id, {
      instructorName: "Alicia Alonso",
      scheduledDate: "2099-10-10",
    });
    const individual = await createIndividual();

    await expect(register(individual.cookie, seminar.id)).resolves.toEqual({
      intent: registerIndividualSeminarInscriptionIntent,
      message: "Inscripción guardada.",
      status: "success",
    });
    await expect(load(individual.cookie)).resolves.toMatchObject({
      seminars: [
        {
          id: seminar.id,
          priceAmount: ordinaryPrice,
          inscription: { hasMoney: false, status: { kind: "reserved" } },
        },
      ],
    });
    await expect(register(individual.cookie, seminar.id)).resolves.toEqual({
      intent: registerIndividualSeminarInscriptionIntent,
      message: "Ya estás inscripto en este seminario.",
      status: "error",
    });
  });

  test("reads `Señada` once administration covers the deposit, and withdraws it on removal", async () => {
    const event = await createActiveEvent();
    const seminar = await addSeminar(event.id, {
      instructorName: "Alicia Alonso",
      scheduledDate: "2099-10-10",
    });
    const individual = await createIndividual();
    await register(individual.cookie, seminar.id);
    const inscriptionId = await readInscriptionId(
      individual.cookie,
      seminar.id,
    );
    await coverSeminarInscriptionDeposit({
      academyId: individual.ownerId,
      eventId: event.id,
      inscriptionId,
      seminarId: seminar.id,
    });

    await expect(load(individual.cookie)).resolves.toMatchObject({
      seminars: [
        {
          inscription: {
            id: inscriptionId,
            hasMoney: true,
            status: { kind: "status", status: "depositMet" },
          },
        },
      ],
    });
    await expect(remove(individual.cookie, inscriptionId)).resolves.toEqual({
      intent: deleteIndividualSeminarInscriptionIntent,
      message: "Inscripción retirada.",
      status: "success",
    });
    await expect(load(individual.cookie)).resolves.toMatchObject({
      seminars: [{ id: seminar.id, inscription: null }],
    });
  });

  test("deletes an inscription with no money", async () => {
    const event = await createActiveEvent();
    const seminar = await addSeminar(event.id, {
      instructorName: "Alicia Alonso",
      scheduledDate: "2099-10-10",
    });
    const individual = await createIndividual();
    await register(individual.cookie, seminar.id);
    const inscriptionId = await readInscriptionId(
      individual.cookie,
      seminar.id,
    );

    await expect(remove(individual.cookie, inscriptionId)).resolves.toEqual({
      intent: deleteIndividualSeminarInscriptionIntent,
      message: "Inscripción eliminada.",
      status: "success",
    });
  });

  test("closes registration and removal once the seminar has started", async () => {
    const event = await createActiveEvent();
    const started = await addSeminar(event.id, {
      instructorName: "Alicia Alonso",
      scheduledDate: "2020-10-10",
    });
    const individual = await createIndividual();

    await expect(load(individual.cookie)).resolves.toMatchObject({
      seminars: [{ id: started.id, hasStarted: true }],
    });
    await expect(register(individual.cookie, started.id)).resolves.toEqual({
      intent: registerIndividualSeminarInscriptionIntent,
      message: "El seminario ya comenzó.",
      status: "error",
    });
  });

  test("does not let an individual remove another one's inscription", async () => {
    const event = await createActiveEvent();
    const seminar = await addSeminar(event.id, {
      instructorName: "Alicia Alonso",
      scheduledDate: "2099-10-10",
    });
    const owner = await createIndividual();
    const other = await createIndividual();
    await register(owner.cookie, seminar.id);
    const inscriptionId = await readInscriptionId(owner.cookie, seminar.id);

    await expect(remove(other.cookie, inscriptionId)).resolves.toEqual({
      intent: deleteIndividualSeminarInscriptionIntent,
      message: "No encontramos esa inscripción.",
      status: "error",
    });
  });

  test("is an individual's page only", async () => {
    const academy = await createAcademySession({
      academyName: "Academia Norte",
      email: `${crypto.randomUUID()}@example.com`,
    });

    await expectThrownResponse(load(academy.cookie), 403);
    await expectThrownResponse(register(academy.cookie, "seminar"), 403);
  });
});

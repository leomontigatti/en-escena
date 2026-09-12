import { describe, expect, test } from "vitest";

import {
  createDancer,
  createProfessor,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import { activateEvent } from "@/lib/events/management.server";
import { createPortalSavedEvent } from "@/lib/events/saved-event-test-support.server";
import { createSeminar } from "@/lib/seminars/repository.server";
import { defaultSeminarFacts } from "@/lib/test-support/seminars";
import {
  createAcademySession,
  createPortalPostRequest,
} from "@/features/portal/test-support/db";
import {
  handlePortalSeminarsListAction,
  loadPortalSeminarsList,
} from "@/features/portal/seminars/list/server";
import {
  deletePortalSeminarInscriptionIntent,
  registerPortalSeminarInscriptionIntent,
  toPortalSeminarPersonValue,
} from "@/features/portal/seminars/list/shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const seminariosUrl = "http://localhost/portal/seminarios";

async function createActiveEventWithSeminar(quota = 5) {
  const event = await createPortalSavedEvent({ name: "Regional 2026" });
  await activateEvent(event.id);
  const result = await createSeminar(event.id, {
    instructorName: "Abril Sosa",
    // Far enough ahead that the seminar is open whenever the suite runs.
    scheduledDate: "2099-10-10",
    startTime: "18:30",
    quota,
    ...defaultSeminarFacts,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return { event, seminar: result.seminar };
}

function loadList(cookie: string) {
  return loadPortalSeminarsList(
    new Request(seminariosUrl, { headers: { cookie } }),
  );
}

function registerRequest(
  cookie: string,
  input: { seminarId: string; person: string },
) {
  const body = new FormData();

  body.set("intent", registerPortalSeminarInscriptionIntent);
  body.set("seminarId", input.seminarId);
  body.set("person", input.person);

  return handlePortalSeminarsListAction(
    createPortalPostRequest(seminariosUrl, cookie, body),
  );
}

function deleteRequest(cookie: string, inscriptionId: string) {
  const body = new FormData();

  body.set("intent", deletePortalSeminarInscriptionIntent);
  body.set("id", inscriptionId);
  body.set("confirmDeletion", inscriptionId);

  return handlePortalSeminarsListAction(
    createPortalPostRequest(seminariosUrl, cookie, body),
  );
}

describe.sequential("portal seminars list", () => {
  test("reads the active event's seminars with the academy's picker and its own inscriptions", async () => {
    const session = await createAcademySession({
      academyName: "Academia Seminarios",
      email: "seminarios.lista@example.com",
    });
    const { seminar } = await createActiveEventWithSeminar();
    const dancer = await createDancer(session.academyId, {
      firstName: "Ana",
      lastName: "Paz",
    });
    await createProfessor(session.academyId, {
      firstName: "Luz",
      lastName: "Suárez",
    });

    await expect(loadList(session.cookie)).resolves.toMatchObject({
      hasActiveEvent: true,
      seminars: [
        {
          id: seminar.id,
          instructorName: "Abril Sosa",
          instructorPictureUrl: null,
          hasStarted: false,
          isFull: false,
          inscriptions: [],
          people: [
            { fullName: "Ana Paz", kind: "dancer" },
            { fullName: "Luz Suárez", kind: "professor" },
          ],
        },
      ],
    });

    await expect(
      registerRequest(session.cookie, {
        seminarId: seminar.id,
        person: toPortalSeminarPersonValue({ id: dancer.id, kind: "dancer" }),
      }),
    ).resolves.toMatchObject({ status: "success" });

    const loaderData = await loadList(session.cookie);

    expect(loaderData.seminars[0]).toMatchObject({
      inscriptions: [{ fullName: "Ana Paz" }],
      people: [{ fullName: "Luz Suárez" }],
    });
  });

  test("turns a refusal into an error message instead of a field error", async () => {
    const session = await createAcademySession({
      academyName: "Academia Sin Lugares",
      email: "seminarios.refusal@example.com",
    });
    const { seminar } = await createActiveEventWithSeminar(1);
    const first = await createDancer(session.academyId, { firstName: "Uno" });
    const second = await createDancer(session.academyId, { firstName: "Dos" });

    await registerRequest(session.cookie, {
      seminarId: seminar.id,
      person: toPortalSeminarPersonValue({ id: first.id, kind: "dancer" }),
    });

    await expect(
      registerRequest(session.cookie, {
        seminarId: seminar.id,
        person: toPortalSeminarPersonValue({ id: second.id, kind: "dancer" }),
      }),
    ).resolves.toEqual({
      intent: registerPortalSeminarInscriptionIntent,
      message: "Sin lugares disponibles.",
      status: "error",
    });
  });

  test("deletes the academy's own inscription and frees the place it held", async () => {
    const session = await createAcademySession({
      academyName: "Academia Baja",
      email: "seminarios.baja@example.com",
    });
    const { seminar } = await createActiveEventWithSeminar(1);
    const first = await createDancer(session.academyId, { firstName: "Uno" });
    const second = await createDancer(session.academyId, { firstName: "Dos" });

    await registerRequest(session.cookie, {
      seminarId: seminar.id,
      person: toPortalSeminarPersonValue({ id: first.id, kind: "dancer" }),
    });

    const [card] = (await loadList(session.cookie)).seminars;

    expect(card).toMatchObject({ isFull: true });

    await expect(
      deleteRequest(session.cookie, card.inscriptions[0].id),
    ).resolves.toEqual({
      intent: deletePortalSeminarInscriptionIntent,
      message: "Inscripción eliminada.",
      status: "success",
    });
    await expect(loadList(session.cookie)).resolves.toMatchObject({
      seminars: [{ isFull: false, inscriptions: [] }],
    });
    await expect(
      registerRequest(session.cookie, {
        seminarId: seminar.id,
        person: toPortalSeminarPersonValue({ id: second.id, kind: "dancer" }),
      }),
    ).resolves.toMatchObject({ status: "success" });
  });

  test("turns a refused delete into an error message", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dueña",
      email: "seminarios.duena@example.com",
    });
    const stranger = await createAcademySession({
      academyName: "Academia Ajena",
      email: "seminarios.ajena@example.com",
    });
    const { seminar } = await createActiveEventWithSeminar();
    const dancer = await createDancer(owner.academyId, { firstName: "Ana" });

    await registerRequest(owner.cookie, {
      seminarId: seminar.id,
      person: toPortalSeminarPersonValue({ id: dancer.id, kind: "dancer" }),
    });

    const [card] = (await loadList(owner.cookie)).seminars;

    await expect(
      deleteRequest(stranger.cookie, card.inscriptions[0].id),
    ).resolves.toEqual({
      intent: deletePortalSeminarInscriptionIntent,
      message: "No encontramos esa inscripción.",
      status: "error",
    });
    await expect(loadList(owner.cookie)).resolves.toMatchObject({
      seminars: [{ inscriptions: [{ fullName: "Ana Paz" }] }],
    });
  });

  test("says there is no active event when none is active", async () => {
    const session = await createAcademySession({
      academyName: "Academia Sin Evento",
      email: "seminarios.sin-evento@example.com",
    });
    await createPortalSavedEvent({ name: "Regional 2026" });

    await expect(loadList(session.cookie)).resolves.toEqual({
      hasActiveEvent: false,
      seminars: [],
    });
  });
});

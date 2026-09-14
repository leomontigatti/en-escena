import { describe, expect, test } from "vitest";

import {
  createDancer,
  createProfessor,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import { activateEvent } from "@/lib/events/management.server";
import { createPortalSavedEvent } from "@/lib/events/saved-event-test-support.server";
import { createSeminarRegistrationPrices } from "@/lib/seminar-prices/test-fixtures.server.db";
import { createSeminar } from "@/lib/seminars/repository.server";
import { defaultSeminarFacts } from "@/lib/test-support/seminars";
import {
  createAcademySession,
  createPortalPostRequest,
} from "@/features/portal/test-support/db";
import {
  handlePortalSeminarDetailAction,
  loadPortalSeminarDetail,
} from "@/features/portal/seminars/detail/server";
import {
  deletePortalSeminarInscriptionIntent,
  registerPortalSeminarInscriptionIntent,
  toPortalSeminarPersonValue,
} from "@/features/portal/seminars/shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

function detailUrl(seminarId: string) {
  return `http://localhost/portal/seminarios/${seminarId}`;
}

async function createActiveEventWithSeminar(quota = 5, withPrices = true) {
  const event = await createPortalSavedEvent({ name: "Regional 2026" });
  await activateEvent(event.id);

  if (withPrices) {
    await createSeminarRegistrationPrices(event.id);
  }

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

function loadDetail(cookie: string, seminarId: string) {
  return loadPortalSeminarDetail({
    params: { seminarId },
    request: new Request(detailUrl(seminarId), { headers: { cookie } }),
  });
}

function registerRequest(
  cookie: string,
  input: { seminarId: string; person: string },
) {
  const body = new FormData();

  body.set("intent", registerPortalSeminarInscriptionIntent);
  body.set("seminarId", input.seminarId);
  body.set("person", input.person);

  return handlePortalSeminarDetailAction({
    params: { seminarId: input.seminarId },
    request: createPortalPostRequest(detailUrl(input.seminarId), cookie, body),
  });
}

function deleteRequest(
  cookie: string,
  input: { seminarId: string; inscriptionId: string },
) {
  const body = new FormData();

  body.set("intent", deletePortalSeminarInscriptionIntent);
  body.set("id", input.inscriptionId);
  body.set("confirmDeletion", input.inscriptionId);

  return handlePortalSeminarDetailAction({
    params: { seminarId: input.seminarId },
    request: createPortalPostRequest(detailUrl(input.seminarId), cookie, body),
  });
}

describe.sequential("portal seminar detail", () => {
  test("reads the seminar, the academy's own inscriptions and the people it may still register", async () => {
    const session = await createAcademySession({
      academyName: "Academia Seminarios",
      email: "seminario.detalle@example.com",
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

    await expect(loadDetail(session.cookie, seminar.id)).resolves.toMatchObject(
      {
        seminar: {
          id: seminar.id,
          instructorName: "Abril Sosa",
          hasStarted: false,
          hasRegistrationPrices: true,
          isFull: false,
        },
        inscriptions: [],
        people: [
          { fullName: "Ana Paz", kind: "dancer" },
          { fullName: "Luz Suárez", kind: "professor" },
        ],
      },
    );

    await expect(
      registerRequest(session.cookie, {
        seminarId: seminar.id,
        person: toPortalSeminarPersonValue({ id: dancer.id, kind: "dancer" }),
      }),
    ).resolves.toMatchObject({ status: "success" });

    // The person registered leaves the picker and joins the table, with the
    // kind the flat table reads and no money on it.
    await expect(loadDetail(session.cookie, seminar.id)).resolves.toMatchObject(
      {
        inscriptions: [
          { fullName: "Ana Paz", personKind: "dancer", hasMoney: false },
        ],
        people: [{ fullName: "Luz Suárez" }],
      },
    );
  });

  test("reads the seminar as unpriced while the event lacks its `Común` price rows", async () => {
    const session = await createAcademySession({
      academyName: "Academia Sin Precios",
      email: "seminario.detalle.sin.precios@example.com",
    });
    const { event, seminar } = await createActiveEventWithSeminar(5, false);

    await expect(loadDetail(session.cookie, seminar.id)).resolves.toMatchObject(
      { seminar: { hasRegistrationPrices: false } },
    );

    await createSeminarRegistrationPrices(event.id);

    await expect(loadDetail(session.cookie, seminar.id)).resolves.toMatchObject(
      { seminar: { hasRegistrationPrices: true } },
    );
  });

  test("is a 404 for a seminar outside the active event", async () => {
    const session = await createAcademySession({
      academyName: "Academia Otro Evento",
      email: "seminario.detalle.otro@example.com",
    });
    const other = await createPortalSavedEvent({ name: "Regional 2025" });
    const otherSeminar = await createSeminar(other.id, {
      instructorName: "Otro Instructor",
      scheduledDate: "2099-11-11",
      startTime: "10:00",
      quota: 5,
      ...defaultSeminarFacts,
    });

    if (!otherSeminar.ok) {
      throw new Error(otherSeminar.error);
    }

    await createActiveEventWithSeminar();

    await expect(
      loadDetail(session.cookie, otherSeminar.seminar.id),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("turns a refusal into an error message instead of a field error", async () => {
    const session = await createAcademySession({
      academyName: "Academia Refusal",
      email: "seminario.detalle.refusal@example.com",
    });
    const { seminar } = await createActiveEventWithSeminar(1);
    const archived = await createDancer(session.academyId, {
      active: false,
      firstName: "Uno",
    });

    await expect(
      registerRequest(session.cookie, {
        seminarId: seminar.id,
        person: toPortalSeminarPersonValue({ id: archived.id, kind: "dancer" }),
      }),
    ).resolves.toEqual({
      intent: registerPortalSeminarInscriptionIntent,
      message: "Elegí una persona activa del plantel de tu academia.",
      status: "error",
    });
  });

  test("registers past the quota, because a full seminar closes nothing on the portal", async () => {
    const session = await createAcademySession({
      academyName: "Academia Sin Lugares",
      email: "seminario.detalle.sin.lugares@example.com",
    });
    const { seminar } = await createActiveEventWithSeminar(1);
    const first = await createDancer(session.academyId, { firstName: "Uno" });
    const second = await createDancer(session.academyId, { firstName: "Dos" });

    for (const dancer of [first, second]) {
      await expect(
        registerRequest(session.cookie, {
          seminarId: seminar.id,
          person: toPortalSeminarPersonValue({ id: dancer.id, kind: "dancer" }),
        }),
      ).resolves.toMatchObject({ status: "success" });
    }

    await expect(loadDetail(session.cookie, seminar.id)).resolves.toMatchObject(
      { seminar: { isFull: false } },
    );
    expect(
      (await loadDetail(session.cookie, seminar.id)).inscriptions,
    ).toHaveLength(2);
  });

  test("deletes the academy's own inscription and takes it off the table", async () => {
    const session = await createAcademySession({
      academyName: "Academia Baja",
      email: "seminario.detalle.baja@example.com",
    });
    const { seminar } = await createActiveEventWithSeminar(1);
    const first = await createDancer(session.academyId, { firstName: "Uno" });
    const second = await createDancer(session.academyId, { firstName: "Dos" });

    await registerRequest(session.cookie, {
      seminarId: seminar.id,
      person: toPortalSeminarPersonValue({ id: first.id, kind: "dancer" }),
    });

    const { inscriptions } = await loadDetail(session.cookie, seminar.id);

    await expect(
      deleteRequest(session.cookie, {
        inscriptionId: inscriptions[0].id,
        seminarId: seminar.id,
      }),
    ).resolves.toEqual({
      intent: deletePortalSeminarInscriptionIntent,
      message: "Inscripción eliminada.",
      status: "success",
    });
    await expect(loadDetail(session.cookie, seminar.id)).resolves.toMatchObject(
      { inscriptions: [] },
    );
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
      email: "seminario.detalle.duena@example.com",
    });
    const stranger = await createAcademySession({
      academyName: "Academia Ajena",
      email: "seminario.detalle.ajena@example.com",
    });
    const { seminar } = await createActiveEventWithSeminar();
    const dancer = await createDancer(owner.academyId, { firstName: "Ana" });

    await registerRequest(owner.cookie, {
      seminarId: seminar.id,
      person: toPortalSeminarPersonValue({ id: dancer.id, kind: "dancer" }),
    });

    const { inscriptions } = await loadDetail(owner.cookie, seminar.id);

    await expect(
      deleteRequest(stranger.cookie, {
        inscriptionId: inscriptions[0].id,
        seminarId: seminar.id,
      }),
    ).resolves.toEqual({
      intent: deletePortalSeminarInscriptionIntent,
      message: "No encontramos esa inscripción.",
      status: "error",
    });
    await expect(loadDetail(owner.cookie, seminar.id)).resolves.toMatchObject({
      inscriptions: [{ fullName: "Ana Paz" }],
    });
  });
});

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { events } from "@/db/schema";

import {
  createSavedEvent,
  createSignedInRequest,
} from "@/lib/admin/finances/finances.test-support";
import { createDancer } from "@/lib/choreographies/registration-test-fixtures.server.db";
import { registerSeminarInscription } from "@/lib/seminars/inscriptions.server";
import { listSeminarInscriptions } from "@/lib/seminars/inscription-rosters.server";
import { createSeminar, listSeminars } from "@/lib/seminars/repository.server";
import { defaultSeminarFacts } from "@/lib/test-support/seminars";
import { createAcademyUser } from "@/lib/test-support/academies";
import { expectFlashRedirect } from "@/lib/shared/flash-notification.test-support";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

import {
  handleSeminarCreateAction,
  handleSeminarDetailAction,
} from "./action.server";
import { loadSeminarDetailData, loadSeminarsListData } from "./server";

installDatabaseTestHooks();

// The quota floor is the number of inscriptions that **covered their deposit**,
// which is money this suite does not seed: the count is mocked so the action's
// job — turning that refusal into a toast rather than a field error — can be
// stated on its own. The count itself is exercised in
// `app/lib/finances/seminar-inscription-allocation.server.db.test.ts`.
vi.mock("@/lib/seminars/covered-inscriptions.server", () => ({
  countCoveredSeminarInscriptions: vi.fn(async () => 0),
  hasCoveredSeminarInscription: vi.fn(async () => false),
}));

const { countCoveredSeminarInscriptions } = vi.mocked(
  await import("@/lib/seminars/covered-inscriptions.server"),
);

afterEach(() => {
  countCoveredSeminarInscriptions.mockResolvedValue(0);
});

const seminarFields = {
  instructorName: "Abril Sosa",
  scheduledDate: "2026-10-10",
  startTime: "18:30",
  quota: "20",
  kind: "special",
  requiredDepositPercentage: "40",
};

async function buildSignedRequest(
  requestUrl: string,
  fields?: Record<string, string>,
) {
  const signedIn = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: "admin",
    requestUrl,
  });

  if (!fields) {
    return signedIn.request;
  }

  const formData = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }

  return new Request(requestUrl, {
    method: "POST",
    body: formData,
    headers: { cookie: signedIn.request.headers.get("cookie") ?? "" },
  });
}

async function createSavedSeminar(eventId: string) {
  const created = await createSeminar(eventId, {
    ...seminarFields,
    ...defaultSeminarFacts,
    quota: 20,
  });

  if (!created.ok) {
    throw new Error(
      `Expected the seminar fixture to be saved: ${created.error}`,
    );
  }

  return created.seminar.id;
}

async function expectThrownResponse(action: Promise<unknown>) {
  try {
    await action;
  } catch (thrown) {
    if (thrown instanceof Response) {
      return thrown;
    }

    throw thrown;
  }

  throw new Error("Expected the seminar action to throw a response.");
}

describe.sequential("admin seminars", () => {
  test("creates a seminar on the active event and redirects to its detail", async () => {
    const event = await createSavedEvent();
    const request = await buildSignedRequest(
      "http://localhost/administracion/seminarios/nuevo",
      { intent: "create-seminar", ...seminarFields },
    );

    const response = await expectThrownResponse(
      handleSeminarCreateAction(request),
    );

    const [seminar] = await listSeminars(event.id);
    expect(seminar).toMatchObject({
      instructorName: "Abril Sosa",
      scheduledDate: "2026-10-10",
      startTime: "18:30",
      quota: 20,
      availablePlaces: 20,
      kind: "special",
      requiredDepositPercentage: 40,
    });
    await expectFlashRedirect(
      response,
      `/administracion/seminarios/${seminar?.id}`,
      {
        id: "route-notification:seminario-creado",
        message: "Seminario creado.",
        variant: "success",
      },
    );
  });

  test("refuses the same instructor at the same moment on the instructor field", async () => {
    const event = await createSavedEvent();
    await createSavedSeminar(event.id);
    const request = await buildSignedRequest(
      "http://localhost/administracion/seminarios/nuevo",
      { intent: "create-seminar", ...seminarFields },
    );

    await expect(handleSeminarCreateAction(request)).resolves.toMatchObject({
      status: "error",
      intent: "create-seminar",
      fieldErrors: {
        instructorName:
          "Cambiá el instructor, la fecha o la hora del seminario.",
      },
      values: seminarFields,
    });
  });

  test("refuses an empty instructor and a quota below one before touching the database", async () => {
    await createSavedEvent();
    const request = await buildSignedRequest(
      "http://localhost/administracion/seminarios/nuevo",
      {
        intent: "create-seminar",
        ...seminarFields,
        instructorName: "",
        quota: "0",
      },
    );

    await expect(handleSeminarCreateAction(request)).resolves.toMatchObject({
      status: "error",
      fieldErrors: {
        instructorName: "Este campo es obligatorio.",
        quota: "Ingresá un cupo mayor a cero.",
      },
    });
  });

  test("saves an edited seminar and stays on the detail with a success toast", async () => {
    const event = await createSavedEvent();
    const seminarId = await createSavedSeminar(event.id);
    const request = await buildSignedRequest(
      `http://localhost/administracion/seminarios/${seminarId}`,
      {
        intent: "update-seminar",
        ...seminarFields,
        instructorName: "Nicolás Prado",
        scheduledDate: "2026-10-11",
        startTime: "09:00",
        quota: "8",
        kind: "regular",
        requiredDepositPercentage: "25",
      },
    );

    await expect(
      handleSeminarDetailAction(request, seminarId),
    ).resolves.toMatchObject({
      status: "success",
      intent: "update-seminar",
      message: "Seminario guardado.",
    });
    await expect(listSeminars(event.id)).resolves.toMatchObject([
      {
        instructorName: "Nicolás Prado",
        scheduledDate: "2026-10-11",
        startTime: "09:00",
        quota: 8,
        kind: "regular",
        requiredDepositPercentage: 25,
      },
    ]);
  });

  test("deletes a seminar from its detail and redirects to the list", async () => {
    const event = await createSavedEvent();
    const seminarId = await createSavedSeminar(event.id);
    const request = await buildSignedRequest(
      `http://localhost/administracion/seminarios/${seminarId}`,
      { intent: "delete-seminar", id: seminarId, confirmDeletion: seminarId },
    );

    const response = await expectThrownResponse(
      handleSeminarDetailAction(request, seminarId),
    );

    await expectFlashRedirect(response, "/administracion/seminarios", {
      id: "route-notification:seminario-eliminado",
      message: "Seminario eliminado.",
      variant: "success",
    });
    await expect(listSeminars(event.id)).resolves.toEqual([]);
  });

  test("refuses to delete a seminar with inscriptions and accepts once it has none", async () => {
    const { eventId, seminarId, inscriptionIds } = await createRegistration([
      "Abril",
    ]);
    const inscriptionId = inscriptionIds[0] ?? "";

    await expect(
      handleSeminarDetailAction(
        await buildSignedRequest(seminarUrl(seminarId), {
          intent: "delete-seminar",
          id: seminarId,
          confirmDeletion: seminarId,
        }),
        seminarId,
      ),
    ).resolves.toMatchObject({
      status: "error",
      intent: "delete-seminar",
      message: "No se puede borrar el seminario porque tiene inscripciones.",
    });
    await expect(listSeminars(eventId)).resolves.toHaveLength(1);

    await expect(
      handleSeminarDetailAction(
        await buildSignedRequest(seminarUrl(seminarId), {
          intent: "delete-seminar-inscription",
          id: inscriptionId,
          confirmDeletion: inscriptionId,
        }),
        seminarId,
      ),
    ).resolves.toMatchObject({
      status: "success",
      intent: "delete-seminar-inscription",
      message: "Inscripción eliminada.",
    });
    await expect(listSeminarInscriptions(seminarId)).resolves.toEqual([]);

    const response = await expectThrownResponse(
      handleSeminarDetailAction(
        await buildSignedRequest(seminarUrl(seminarId), {
          intent: "delete-seminar",
          id: seminarId,
          confirmDeletion: seminarId,
        }),
        seminarId,
      ),
    );

    expect(response.status).toBe(302);
    await expect(listSeminars(eventId)).resolves.toEqual([]);
  });

  test("removes an inscription only once the removal is confirmed", async () => {
    const { seminarId, inscriptionIds } = await createRegistration(["Abril"]);
    const inscriptionId = inscriptionIds[0] ?? "";

    await expect(
      handleSeminarDetailAction(
        await buildSignedRequest(seminarUrl(seminarId), {
          intent: "delete-seminar-inscription",
          id: inscriptionId,
        }),
        seminarId,
      ),
    ).resolves.toMatchObject({
      status: "error",
      intent: "delete-seminar-inscription",
    });
    await expect(listSeminarInscriptions(seminarId)).resolves.toHaveLength(1);

    // The detail carries the tab's rows, so the removal has something to open.
    await expect(
      loadSeminarDetailData(
        await buildSignedRequest(seminarUrl(seminarId)),
        seminarId,
      ),
    ).resolves.toMatchObject({
      inscriptions: [
        {
          id: inscriptionId,
          fullName: "Abril Sosa",
          personKind: "dancer",
          academyName: "Academia Inscripciones",
        },
      ],
    });
  });

  // The floor is a refusal the reader can only act on by removing someone, so
  // it is a toast about the seminar and not an error under the quota field.
  test("refuses a quota below the covered count as a message, not a field error", async () => {
    const { seminarId } = await createRegistration();

    countCoveredSeminarInscriptions.mockResolvedValue(2);

    await expect(
      handleSeminarDetailAction(
        await buildSignedRequest(seminarUrl(seminarId), {
          intent: "update-seminar",
          ...seminarFields,
          quota: "0",
        }),
        seminarId,
      ),
    ).resolves.toMatchObject({
      status: "error",
      fieldErrors: { quota: "Ingresá un cupo mayor a cero." },
    });

    const refused = await handleSeminarDetailAction(
      await buildSignedRequest(seminarUrl(seminarId), {
        intent: "update-seminar",
        ...seminarFields,
        instructorName: "Nicolás Prado",
        quota: "1",
      }),
      seminarId,
    );

    expect(refused).toMatchObject({
      status: "error",
      intent: "update-seminar",
      message:
        "No se puede bajar el cupo a menos de 2: es la cantidad de inscripciones con la seña cubierta.",
    });
    expect(refused.fieldErrors).toBeUndefined();

    // Every other field still edits freely once the quota clears the floor,
    // the date into the past included.
    await expect(
      handleSeminarDetailAction(
        await buildSignedRequest(seminarUrl(seminarId), {
          intent: "update-seminar",
          ...seminarFields,
          instructorName: "Nicolás Prado",
          scheduledDate: "2020-01-01",
          quota: "2",
        }),
        seminarId,
      ),
    ).resolves.toMatchObject({ status: "success" });
  });

  test("asks for a confirmation before deleting", async () => {
    const event = await createSavedEvent();
    const seminarId = await createSavedSeminar(event.id);
    const request = await buildSignedRequest(
      `http://localhost/administracion/seminarios/${seminarId}`,
      { intent: "delete-seminar", id: seminarId },
    );

    await expect(
      handleSeminarDetailAction(request, seminarId),
    ).resolves.toMatchObject({
      status: "error",
      intent: "delete-seminar",
    });
    await expect(listSeminars(event.id)).resolves.toHaveLength(1);
  });

  // A seminar is not part of the `Bases del evento`, so it has no say in
  // whether the event is ready to take registrations.
  test("leaves the event registration readiness untouched", async () => {
    const event = await createSavedEvent();
    const readinessBefore = await readEventReadiness(event.id);
    const request = await buildSignedRequest(
      "http://localhost/administracion/seminarios/nuevo",
      { intent: "create-seminar", ...seminarFields },
    );

    await expectThrownResponse(handleSeminarCreateAction(request));

    await expect(readEventReadiness(event.id)).resolves.toEqual(
      readinessBefore,
    );
  });

  test("loads the active event seminars and reports a missing one as not found", async () => {
    const event = await createSavedEvent();
    const seminarId = await createSavedSeminar(event.id);
    const request = await buildSignedRequest(
      "http://localhost/administracion/seminarios",
    );

    await expect(loadSeminarsListData(request)).resolves.toMatchObject({
      selectedEventId: event.id,
      seminars: [{ id: seminarId, availablePlaces: 20 }],
    });
    await expect(
      loadSeminarDetailData(request, seminarId),
    ).resolves.toMatchObject({
      seminar: { id: seminarId },
      values: {
        instructorName: "Abril Sosa",
        scheduledDate: "2026-10-10",
        startTime: "18:30",
        quota: "20",
      },
    });

    const notFound = await expectThrownResponse(
      loadSeminarDetailData(request, "seminar_missing"),
    );
    expect(notFound.status).toBe(404);
  });
});

function seminarUrl(seminarId: string) {
  return `http://localhost/administracion/seminarios/${seminarId}`;
}

/** A seminar of the active event with one dancer per given name on it. */
async function createRegistration(firstNames = ["Abril", "Beto"]) {
  const event = await createSavedEvent();
  const seminarId = await createSavedSeminar(event.id);
  const { academy } = await createAcademyUser({
    academyName: "Academia Inscripciones",
    email: `${crypto.randomUUID()}@example.com`,
  });
  const inscriptionIds: string[] = [];

  for (const firstName of firstNames) {
    const dancer = await createDancer(academy.id, {
      firstName,
      lastName: "Sosa",
    });
    const registered = await registerSeminarInscription({
      academyId: academy.id,
      eventId: event.id,
      now: new Date("2026-10-10T21:29:00.000Z"),
      personId: dancer.id,
      personKind: "dancer",
      seminarId,
    });

    if (!registered.ok) {
      throw new Error(`Expected the inscription: ${registered.error}`);
    }

    inscriptionIds.push(registered.inscriptionId);
  }

  return { eventId: event.id, seminarId, inscriptionIds };
}

async function readEventReadiness(eventId: string) {
  const event = await db.query.events.findFirst({
    columns: {
      registrationReady: true,
      registrationReadinessDirty: true,
      registrationReadinessMissingItems: true,
    },
    where: eq(events.id, eventId),
  });

  if (!event) {
    throw new Error("Expected the event to exist.");
  }

  return event;
}

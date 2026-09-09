import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events } from "@/db/schema";

import {
  createSavedEvent,
  createSignedInRequest,
} from "@/lib/admin/finances/finances.test-support";
import { createSeminar, listSeminars } from "@/lib/seminars/repository.server";
import { expectFlashRedirect } from "@/lib/shared/flash-notification.test-support";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

import {
  handleSeminarCreateAction,
  handleSeminarDetailAction,
} from "./action.server";
import { loadSeminarDetailData, loadSeminarsListData } from "./server";

installDatabaseTestHooks();

const seminarFields = {
  instructorName: "Abril Sosa",
  scheduledDate: "2026-10-10",
  startTime: "18:30",
  quota: "20",
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
  const created = await createSeminar(eventId, { ...seminarFields, quota: 20 });

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
        instructorName: "Nicolás Prado",
        scheduledDate: "2026-10-11",
        startTime: "09:00",
        quota: "8",
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

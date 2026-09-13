import { describe, expect, test } from "vitest";

import { createDancer } from "@/lib/choreographies/registration-test-fixtures.server.db";
import { activateEvent } from "@/lib/events/management.server";
import { createPortalSavedEvent } from "@/lib/events/saved-event-test-support.server";
import { createSeminarRegistrationPrices } from "@/lib/seminar-prices/test-fixtures.server.db";
import { registerSeminarInscription } from "@/lib/seminars/inscriptions.server";
import { createSeminar } from "@/lib/seminars/repository.server";
import { defaultSeminarFacts } from "@/lib/test-support/seminars";
import { createAcademySession } from "@/features/portal/test-support/db";
import { loadPortalSeminarsList } from "@/features/portal/seminars/list/server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const seminariosUrl = "http://localhost/portal/seminarios";

async function createActiveEventWithSeminar(quota = 5) {
  const event = await createPortalSavedEvent({ name: "Regional 2026" });
  await activateEvent(event.id);
  await createSeminarRegistrationPrices(event.id);

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

describe.sequential("portal seminars list", () => {
  test("reads a poster per seminar of the active event, with the academy's own count on it", async () => {
    const session = await createAcademySession({
      academyName: "Academia Seminarios",
      email: "seminarios.lista@example.com",
    });
    const { event, seminar } = await createActiveEventWithSeminar();
    const dancer = await createDancer(session.academyId, {
      firstName: "Ana",
      lastName: "Paz",
    });

    await expect(loadList(session.cookie)).resolves.toEqual({
      hasActiveEvent: true,
      seminars: [
        {
          id: seminar.id,
          instructorName: "Abril Sosa",
          instructorPictureUrl: null,
          scheduledDate: "2099-10-10",
          startTime: "18:30",
          inscriptionCount: 0,
        },
      ],
    });

    await registerSeminarInscription({
      academyId: session.academyId,
      eventId: event.id,
      now: new Date(),
      personId: dancer.id,
      personKind: "dancer",
      seminarId: seminar.id,
    });

    await expect(loadList(session.cookie)).resolves.toMatchObject({
      seminars: [{ inscriptionCount: 1 }],
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

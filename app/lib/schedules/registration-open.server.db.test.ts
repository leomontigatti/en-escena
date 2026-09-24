import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events } from "@/db/schema";
import { getEventRegistrationReadiness } from "@/lib/events/registration-readiness.server";
import {
  createEventModalitiesFixture,
  createSavedSchedule,
} from "@/lib/events/bases-test-fixtures.server.db";
import { createOpenEventCatalog } from "@/lib/choreographies/registration-test-fixtures.server.db";
import { eventEndedRegistrationOpenBlocker } from "@/lib/schedules/registration-open";
import {
  closeScheduleRegistration,
  getEventRegistrationOpenBlockers,
  openScheduleRegistration,
} from "@/lib/schedules/registration-open.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const farFuture = new Date("2099-05-03T12:00:00.000Z");

describe("schedule registration switch", () => {
  test("opens and closes a schedule of a ready event that has not finished", async () => {
    const { event, catalog } = await createOpenEventCatalog({
      endsAt: farFuture,
    });

    await expect(getEventRegistrationOpenBlockers(event.id)).resolves.toEqual(
      [],
    );
    await expect(
      openScheduleRegistration(catalog.schedule.id),
    ).resolves.toMatchObject({ ok: true, record: { registrationOpen: true } });
    await expect(
      closeScheduleRegistration(catalog.schedule.id),
    ).resolves.toMatchObject({ ok: true, record: { registrationOpen: false } });
  });

  test("refuses to open while the event is not ready, and names what is missing", async () => {
    const { event, jazz } = await createEventModalitiesFixture();
    const schedule = await createSavedSchedule(event.id, {
      modalityIds: [jazz.id],
    });

    const refusal = await openScheduleRegistration(schedule.id);

    expect(refusal).toMatchObject({
      ok: false,
      code: "schedule-registration-not-allowed",
      error: "No se pueden abrir las inscripciones de este cronograma.",
    });
    expect(
      refusal.ok ? [] : (refusal as { reasons: string[] }).reasons,
    ).toContain("Falta al menos un precio en este evento.");

    // Closing is never blocked by the configuration the opening asks for.
    await expect(closeScheduleRegistration(schedule.id)).resolves.toMatchObject(
      { ok: true, record: { registrationOpen: false } },
    );
  });

  test("refuses to open once the event has finished", async () => {
    const { event, catalog } = await createOpenEventCatalog({
      endsAt: new Date("2020-05-03T12:00:00.000Z"),
    });

    await expect(getEventRegistrationOpenBlockers(event.id)).resolves.toEqual([
      eventEndedRegistrationOpenBlocker,
    ]);
    await expect(
      openScheduleRegistration(catalog.schedule.id),
    ).resolves.toMatchObject({
      ok: false,
      code: "schedule-registration-not-allowed",
      reasons: [eventEndedRegistrationOpenBlocker],
    });
  });

  // Readiness measures the `Bases del evento`, never the switch: flipping it
  // leaves the cached calculation exactly as fresh as it was.
  test("leaves the registration readiness cache clean", async () => {
    const { event, catalog } = await createOpenEventCatalog({
      endsAt: farFuture,
    });

    await getEventRegistrationReadiness(event.id);
    await expect(readReadinessDirty(event.id)).resolves.toBe(false);

    await openScheduleRegistration(catalog.schedule.id);
    await expect(readReadinessDirty(event.id)).resolves.toBe(false);

    await closeScheduleRegistration(catalog.schedule.id);
    await expect(readReadinessDirty(event.id)).resolves.toBe(false);
  });
});

async function readReadinessDirty(eventId: string) {
  const event = await db.query.events.findFirst({
    columns: { registrationReadinessDirty: true },
    where: eq(events.id, eventId),
  });

  return event?.registrationReadinessDirty;
}

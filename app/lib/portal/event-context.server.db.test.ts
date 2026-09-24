import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { schedules } from "@/db/schema";
import {
  createEventRecord,
  createOpenEventCatalog,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import {
  getPortalActiveEventContext,
  getPortalShellEventContext,
} from "@/lib/portal/event-context.server";
import {
  closeScheduleRegistration,
  openScheduleRegistration,
} from "@/lib/schedules/registration-open.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("portal event context derived inscriptions state", () => {
  test("is open while any schedule of the active event is open", async () => {
    const { event, catalog } = await createOpenEventCatalog({
      endsAt: new Date("2099-05-03T12:00:00.000Z"),
    });
    const second = await insertSchedule(event.id);

    // The fixture leaves the catalog's `Cronograma` open and the second closed.
    await expect(portalRegistrationState()).resolves.toBe(true);

    await closeScheduleRegistration(catalog.schedule.id);

    await expect(portalRegistrationState()).resolves.toBe(false);

    await openScheduleRegistration(second.id);

    await expect(portalRegistrationState()).resolves.toBe(true);

    await closeScheduleRegistration(second.id);

    await expect(portalRegistrationState()).resolves.toBe(false);
  });

  test("is closed when the active event has no schedules at all", async () => {
    await createEventRecord({ active: true });

    await expect(portalRegistrationState()).resolves.toBe(false);
  });
});

async function insertSchedule(eventId: string) {
  const [schedule] = await db
    .insert(schedules)
    .values({
      eventId,
      name: `Segundo bloque ${eventId}`,
      scheduledDate: "2026-05-02",
      startTime: "10:00",
      totalCapacity: 10,
    })
    .returning();

  return schedule;
}

async function portalRegistrationState() {
  const request = new Request("http://localhost/portal");
  const [shell, active] = await Promise.all([
    getPortalShellEventContext(request),
    getPortalActiveEventContext(request),
  ]);

  expect(shell.isRegistrationOpen).toBe(active.isRegistrationOpen);

  return active.isRegistrationOpen;
}

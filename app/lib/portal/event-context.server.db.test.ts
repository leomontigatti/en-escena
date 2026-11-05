import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { schedules } from "@/db/schema";
import {
  createEventRecord,
  createOpenEventCatalog,
} from "@/lib/choreographies/registration.test-support";
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

// #1808: the portal shell carries the active event's `Estado del evento`, derived
// from its dates, and none without an active event.
describe("portal shell event context event status", () => {
  test("is finished once the active event's end has passed", async () => {
    await createEventRecord({
      active: true,
      startsAt: new Date("2026-05-01T12:00:00.000Z"),
      endsAt: new Date("2026-05-03T12:00:00.000Z"),
    });

    await expect(
      getPortalShellEventContext(new Request("http://localhost/portal")),
    ).resolves.toMatchObject({ eventStatus: "finished" });
  });

  test("is absent without an active event", async () => {
    await createEventRecord({ active: false });

    const context = await getPortalShellEventContext(
      new Request("http://localhost/portal"),
    );

    expect(context).toEqual({ activeEvent: null, isRegistrationOpen: false });
  });
});

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

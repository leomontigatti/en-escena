import { asc, eq, inArray } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academies,
  choreographies,
  dancers,
  events,
  professors,
  user,
} from "@/db/schema";
import { signInAccessUser } from "@/lib/auth/access-auth.test-support";
import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";
import { getEventRegistrationReadiness } from "@/lib/events/registration-readiness.server";
import {
  DEV_SEED_ACADEMY_EMAIL,
  DEV_SEED_ADMIN_EMAIL,
  DEV_SEED_PASSWORD,
  seedDevData,
} from "@/lib/dev-seed/seed.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const now = new Date("2026-09-25T12:00:00Z");

describe("dev seed", () => {
  test("creates a verified admin and academy that sign in with the shared dev password", async () => {
    await seedDevData({ now });

    const seededUsers = await db.query.user.findMany({
      where: inArray(user.email, [
        DEV_SEED_ADMIN_EMAIL,
        DEV_SEED_ACADEMY_EMAIL,
      ]),
    });

    expect(
      seededUsers.map(({ email, role, emailVerified }) => ({
        email,
        role,
        emailVerified,
      })),
    ).toEqual(
      expect.arrayContaining([
        { email: DEV_SEED_ADMIN_EMAIL, role: "admin", emailVerified: true },
        { email: DEV_SEED_ACADEMY_EMAIL, role: "academy", emailVerified: true },
      ]),
    );

    for (const email of [DEV_SEED_ADMIN_EMAIL, DEV_SEED_ACADEMY_EMAIL]) {
      await expect(
        signInAccessUser({ email, password: DEV_SEED_PASSWORD }),
      ).resolves.toMatchObject({ user: { email } });
    }
  });

  test("opens registrations on the active event and registers one choreography for the academy", async () => {
    await seedDevData({ now });

    const seededEvents = await db.query.events.findMany({
      orderBy: asc(events.startsAt),
    });

    expect(seededEvents.map(({ name, active }) => ({ name, active }))).toEqual([
      { name: "Evento Finalizado", active: false },
      { name: "Evento Activo", active: true },
      { name: "Evento Futuro", active: false },
    ]);
    expect(seededEvents[0].endsAt.getTime()).toBeLessThan(now.getTime());
    expect(seededEvents[1].startsAt.getTime()).toBeGreaterThan(now.getTime());

    const activeEvent = seededEvents[1];
    const readiness = await getEventRegistrationReadiness(activeEvent.id);
    expect(readiness).toMatchObject({ isReady: true, missingItems: [] });

    const academy = await db.query.academies.findFirst({
      where: eq(academies.name, "Academia Demo"),
    });
    const academyId = academy?.id ?? "";

    await expect(
      db.$count(dancers, eq(dancers.academyId, academyId)),
    ).resolves.toBe(2);
    await expect(
      db.$count(professors, eq(professors.academyId, academyId)),
    ).resolves.toBe(2);
    await expect(
      db.query.choreographies.findMany({
        where: eq(choreographies.academyId, academyId),
      }),
    ).resolves.toEqual([expect.objectContaining({ eventId: activeEvent.id })]);
  });

  test("re-running resets the demo to the same state, keeping events it does not own", async () => {
    const [unrelatedEvent] = await db
      .insert(events)
      .values({
        name: "Evento Real",
        active: true,
        startsAt: new Date("2026-10-01T12:00:00Z"),
        endsAt: new Date("2026-10-02T12:00:00Z"),
      })
      .returning();

    await expect(seedDevData({ now })).resolves.toEqual({
      deactivatedEventNames: ["Evento Real"],
    });
    const firstRun = await readSeedShape();
    await registerSecondChoreographyAsTheUIWould();

    await seedDevData({ now });

    await expect(readSeedShape()).resolves.toEqual(firstRun);
    await expect(
      db.query.events.findFirst({ where: eq(events.id, unrelatedEvent.id) }),
    ).resolves.toMatchObject({ name: "Evento Real", active: false });
  });
});

async function registerSecondChoreographyAsTheUIWould() {
  const choreography = await db.query.choreographies.findFirst();
  const professor = await db.query.professors.findFirst();
  const dancer = await db.query.dancers.findFirst({
    where: eq(dancers.firstName, "Bea"),
  });

  if (!choreography || !professor || !dancer) {
    throw new Error("Expected the seed to have created its roster.");
  }

  await expect(
    createChoreographyRegistration({
      academyId: choreography.academyId,
      eventId: choreography.eventId,
      name: "Segunda Pieza",
      modalityId: choreography.modalityId,
      submodalityId: choreography.submodalityId,
      dancerIds: [dancer.id],
      professorIds: [professor.id],
      experienceLevelId: null,
      scheduleCapacityId: choreography.scheduleCapacityId ?? "",
    }),
  ).resolves.toMatchObject({ ok: true });
}

async function readSeedShape() {
  const [userRows, eventRows, choreographyRows] = await Promise.all([
    db.select({ email: user.email }).from(user).orderBy(asc(user.email)),
    db
      .select({ name: events.name, active: events.active })
      .from(events)
      .orderBy(asc(events.name)),
    db.select({ name: choreographies.name }).from(choreographies),
  ]);

  return {
    users: userRows,
    events: eventRows,
    choreographies: choreographyRows,
    academies: await db.$count(academies),
    dancers: await db.$count(dancers),
    professors: await db.$count(professors),
  };
}

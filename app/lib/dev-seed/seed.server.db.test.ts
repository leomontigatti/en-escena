import { asc, eq, inArray } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyDancers,
  comprobantes,
  dancers,
  events,
  judgeAssignments,
  payments,
  presentations,
  professors,
  scores,
  user,
} from "@/db/schema";
import { signInAccessUser } from "@/lib/auth/access-auth.test-support";
import { choreographyAnchor } from "@/lib/comprobantes/anchor";
import { listAnchorComprobantes } from "@/lib/comprobantes/comprobantes.server";
import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";
import { getEventRegistrationReadiness } from "@/lib/events/registration-readiness.server";
import { readInscriptionAllocatedAmount } from "@/lib/finances/allocation-pool.server";
import { choreographyTarget } from "@/lib/finances/allocation-target.server";
import { findScoreLockedSubmodalityIds } from "@/lib/judging/criteria.server";
import {
  readFrozenChoreographyIds,
  readParticipationRows,
} from "@/lib/presentations/participation.server";
import {
  DEV_SEED_ACADEMY_EMAIL,
  DEV_SEED_ADMIN_EMAIL,
  DEV_SEED_AUDITOR_EMAIL,
  DEV_SEED_JUDGE_EMAIL,
  DEV_SEED_LEGACY_ACADEMY_EMAIL,
  DEV_SEED_PASSWORD,
  seedDevData,
} from "@/lib/dev-seed/seed.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const now = new Date("2026-09-25T12:00:00Z");

describe("dev seed", () => {
  test("creates one verified account per role, all signing in with the shared dev password", async () => {
    await seedDevData({ now });

    const seededEmails = [
      DEV_SEED_ADMIN_EMAIL,
      DEV_SEED_ACADEMY_EMAIL,
      DEV_SEED_AUDITOR_EMAIL,
      DEV_SEED_JUDGE_EMAIL,
    ];
    const seededUsers = await db.query.user.findMany({
      where: inArray(user.email, seededEmails),
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
        { email: DEV_SEED_AUDITOR_EMAIL, role: "auditor", emailVerified: true },
        { email: DEV_SEED_JUDGE_EMAIL, role: "judge", emailVerified: true },
      ]),
    );

    for (const email of seededEmails) {
      await expect(
        signInAccessUser({ email, password: DEV_SEED_PASSWORD }),
      ).resolves.toMatchObject({ user: { email } });
    }
  });

  test("seeds one academy with its location and one from before the location fields existed", async () => {
    await seedDevData({ now });

    const seeded = await db
      .select({
        city: academies.city,
        name: academies.name,
        province: academies.province,
      })
      .from(academies)
      .innerJoin(user, eq(user.id, academies.userId))
      .where(
        inArray(user.email, [
          DEV_SEED_ACADEMY_EMAIL,
          DEV_SEED_LEGACY_ACADEMY_EMAIL,
        ]),
      )
      .orderBy(asc(academies.name));

    expect(seeded).toEqual([
      { city: null, name: "Academia Antigua", province: null },
      { city: "Rosario", name: "Academia Demo", province: "santa_fe" },
    ]);
  });

  test("opens registrations on the active event and registers four choreographies for the academy", async () => {
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
    ).resolves.toBe(4);
    await expect(
      db.$count(professors, eq(professors.academyId, academyId)),
    ).resolves.toBe(2);
    const registered = await db.query.choreographies.findMany({
      where: eq(choreographies.academyId, academyId),
      orderBy: asc(choreographies.name),
    });
    expect(registered.map(({ name }) => name)).toEqual([
      "Luna de Papel",
      "Río Arriba",
      "Sal y Arena",
      "Viento Sur",
    ]);
    expect(registered.every(({ eventId }) => eventId === activeEvent.id)).toBe(
      true,
    );
  });

  test("leaves a payment allocated past the deposit and a frozen presentation, so the lock alerts have data", async () => {
    await seedDevData({ now });

    const activeEvent = await db.query.events.findFirst({
      where: eq(events.active, true),
    });
    const academy = await db.query.academies.findFirst({
      where: eq(academies.name, "Academia Demo"),
    });
    if (!activeEvent || !academy) {
      throw new Error("Expected the seed's active event and academy.");
    }

    // The payment detail locks its academy once money is allocated.
    const academyPayments = await db.query.payments.findMany({
      where: eq(payments.academyId, academy.id),
    });
    expect(academyPayments).toHaveLength(1);

    // Each paid inscription covers the 30% deposit of its 25000 price, which
    // locks the price in the money dialog and makes the choreography orderable.
    for (const name of ["Luna de Papel", "Viento Sur", "Río Arriba"]) {
      await expect(allocatedTo(name)).resolves.toEqual([10000]);
    }

    // One schedule is evaluated, so its numbered presentations are frozen
    // while the morning block stays open to correction.
    await expect(frozenChoreographyNames(activeEvent.id)).resolves.toEqual([
      "Río Arriba",
      "Viento Sur",
    ]);
  });

  test("leaves one choreography with nothing paid, so the money screens have an unpaid inscription", async () => {
    await seedDevData({ now });

    await expect(allocatedTo("Sal y Arena")).resolves.toEqual([0]);
    await expect(allocatedTo("Luna de Papel")).resolves.toEqual([10000]);
  });

  // The ordering numbers every choreography it finds, paid or not, so the one
  // registered after it is the late registration the removal dialogs and the
  // presentation list read without a number.
  test("leaves one choreography registered after the ordering, so one has no number", async () => {
    await seedDevData({ now });

    const numbered = await db
      .select({ name: choreographies.name })
      .from(presentations)
      .innerJoin(
        choreographies,
        eq(choreographies.id, presentations.choreographyId),
      )
      .orderBy(asc(choreographies.name));

    expect(numbered.map(({ name }) => name)).toEqual([
      "Luna de Papel",
      "Río Arriba",
      "Viento Sur",
    ]);
  });

  test("has the demo judge score one presentation, so the score screens show a number", async () => {
    await seedDevData({ now });

    const scored = await db
      .select({ name: choreographies.name, value: scores.value })
      .from(scores)
      .innerJoin(
        judgeAssignments,
        eq(judgeAssignments.id, scores.judgeAssignmentId),
      )
      .innerJoin(
        presentations,
        eq(presentations.id, judgeAssignments.presentationId),
      )
      .innerJoin(
        choreographies,
        eq(choreographies.id, presentations.choreographyId),
      );
    expect(scored).toEqual([{ name: "Río Arriba", value: "87.0" }]);

    // It is scored in the block the disqualification already froze, under a
    // submodality of its own, so the morning block stays open to correction
    // and `Lírico` keeps its criteria editable.
    const activeEvent = await db.query.events.findFirst({
      where: eq(events.active, true),
    });
    if (!activeEvent) throw new Error("Expected the seed's active event.");
    await expect(frozenChoreographyNames(activeEvent.id)).resolves.toEqual([
      "Río Arriba",
      "Viento Sur",
    ]);
    const locked = await findScoreLockedSubmodalityIds(activeEvent.id);
    expect(locked.size).toBe(1);
  });

  test("invoices what one choreography paid, so the comprobante screens have a row", async () => {
    await seedDevData({ now });

    const invoiced = await db.query.choreographies.findFirst({
      where: eq(choreographies.name, "Río Arriba"),
    });
    await expect(
      listAnchorComprobantes(choreographyAnchor(invoiced?.id ?? "")),
    ).resolves.toMatchObject([
      { cbteTipo: 11, cbteNro: 1, impTotal: 10000, status: "valid" },
    ]);
    await expect(db.$count(comprobantes)).resolves.toBe(1);
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

/** The numbered choreographies whose number is frozen, by name. */
async function frozenChoreographyNames(eventId: string) {
  const rows = await readParticipationRows(eventId);
  const frozen = await readFrozenChoreographyIds(rows);

  return rows
    .filter((row) => frozen.has(row.choreographyId))
    .map((row) => row.name)
    .sort();
}

/** What each inscription of the named choreography has allocated to it. */
async function allocatedTo(choreographyName: string) {
  const inscriptions = await db
    .select({ id: choreographyDancers.id })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .where(eq(choreographies.name, choreographyName));

  return await Promise.all(
    inscriptions.map((inscription) =>
      readInscriptionAllocatedAmount(db, choreographyTarget(inscription.id)),
    ),
  );
}

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
    // Ordered: without it the rows come back in whatever order the engine
    // likes, and the before/after comparison fails on a swap (#1338).
    db
      .select({ name: choreographies.name })
      .from(choreographies)
      .orderBy(asc(choreographies.name)),
  ]);

  return {
    users: userRows,
    events: eventRows,
    choreographies: choreographyRows,
    academies: await db.$count(academies),
    dancers: await db.$count(dancers),
    professors: await db.$count(professors),
    comprobantes: await db.$count(comprobantes),
    scores: await db.$count(scores),
  };
}

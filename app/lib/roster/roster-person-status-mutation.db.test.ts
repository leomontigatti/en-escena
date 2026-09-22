import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  choreographyProfessors,
  dancers,
  prices,
  professors,
} from "@/db/schema";
import {
  createAcademyRecord,
  createDancer,
  createProfessor,
  createSelectedPriceInscriptionForTest,
} from "@/features/portal/choreographies/test-support/db";
import {
  createAcademyFinanceChoreographyFixture,
  createSavedEvent,
} from "@/lib/admin/finances/finances.test-support";
import { listDancerOptionsForChoreography } from "@/lib/choreographies/choreography-roster-options.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import { setRosterPersonStatus } from "@/lib/roster/roster-person-status.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

/**
 * One academy, one choreography of the active event and one dancer inscribed in
 * it at the catalogue price: the shape the guard refuses to archive, and the
 * one that would break if archiving ever touched an inscription.
 */
async function seedInscribedDancer() {
  const event = await createSavedEvent();
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Alta",
      choreographyName: "Aire",
      email: `alta.${crypto.randomUUID()}@example.com`,
      event,
    });
  const [price] = await db
    .select({ id: prices.id })
    .from(prices)
    .where(eq(prices.eventId, event.id));
  const dancer = await createDancer(academy.academy.id, {
    firstName: "Ana",
    lastName: "Inscripta",
  });
  const inscription = await createSelectedPriceInscriptionForTest({
    academyId: academy.academy.id,
    choreographyId: choreography.id,
    dancerId: dancer.id,
    eventId: event.id,
    selectedPriceId: price?.id ?? null,
  });

  return {
    academyId: academy.academy.id,
    choreography,
    dancer,
    eventId: event.id,
    inscriptionId: inscription?.id ?? "",
  };
}

function readInscription(inscriptionId: string) {
  return db
    .select()
    .from(choreographyDancers)
    .where(eq(choreographyDancers.id, inscriptionId))
    .then((rows) => rows[0] ?? null);
}

function readRosterStatus(
  table: typeof dancers | typeof professors,
  personId: string,
) {
  return db
    .select({ active: table.active })
    .from(table)
    .where(eq(table.id, personId))
    .then((rows) => rows[0]?.active ?? null);
}

/**
 * Withdraws the fixture's inscription so the dancer stops participating: every
 * assertion about a *successful* archive needs a person the guard lets through.
 */
function withdrawInscription(inscriptionId: string) {
  return db
    .update(choreographyDancers)
    .set({ withdrawnAt: new Date("2030-05-01T12:00:00Z") })
    .where(eq(choreographyDancers.id, inscriptionId));
}

describe("setRosterPersonStatus", () => {
  test("refuses to archive a dancer participating in the active event, leaving the row and the inscription untouched", async () => {
    const fixture = await seedInscribedDancer();
    const inscriptionBefore = await readInscription(fixture.inscriptionId);

    const refused = await setRosterPersonStatus({
      academyId: fixture.academyId,
      kind: "dancer",
      next: "archived",
      personId: fixture.dancer.id,
      surface: "portal",
    });

    expect(refused).toEqual({
      ok: false,
      cause: "participating",
      message:
        "Este bailarín no puede archivarse porque está participando del evento activo.",
    });
    expect(await readRosterStatus(dancers, fixture.dancer.id)).toBe(true);
    expect(await readInscription(fixture.inscriptionId)).toEqual(
      inscriptionBefore,
    );
  });

  test("refuses to archive a professor participating in the active event, from the admin panel", async () => {
    const fixture = await seedInscribedDancer();
    const professor = await createProfessor(fixture.academyId, {
      firstName: "Luz",
      lastName: "Dicta",
    });
    await db
      .insert(choreographyProfessors)
      .values({
        choreographyId: fixture.choreography.id,
        professorId: professor.id,
      });

    await expect(
      setRosterPersonStatus({
        academyId: null,
        kind: "professor",
        next: "archived",
        personId: professor.id,
        surface: "admin",
      }),
    ).resolves.toEqual({
      ok: false,
      cause: "participating",
      message:
        "Este profesor no puede archivarse porque está participando del evento activo.",
    });
    expect(await readRosterStatus(professors, professor.id)).toBe(true);
  });

  test("archives a dancer whose only inscription is withdrawn, and reactivates a participant", async () => {
    const fixture = await seedInscribedDancer();
    await db
      .update(choreographyDancers)
      .set({ withdrawnAt: new Date("2030-05-01T12:00:00Z") })
      .where(eq(choreographyDancers.id, fixture.inscriptionId));

    const archived = await setRosterPersonStatus({
      academyId: fixture.academyId,
      kind: "dancer",
      next: "archived",
      personId: fixture.dancer.id,
      surface: "portal",
    });

    expect(archived).toMatchObject({ ok: true });
    expect(archived.ok && archived.person.active).toBe(false);

    // Reactivating is never refused, so the live inscription coming back does
    // not stand in the way of undoing the archive.
    await db
      .update(choreographyDancers)
      .set({ withdrawnAt: null })
      .where(eq(choreographyDancers.id, fixture.inscriptionId));

    const reactivated = await setRosterPersonStatus({
      academyId: fixture.academyId,
      kind: "dancer",
      next: "active",
      personId: fixture.dancer.id,
      surface: "portal",
    });

    expect(reactivated.ok && reactivated.person.active).toBe(true);
  });

  test("leaves the choreography's operational finance row identical before and after archiving", async () => {
    const fixture = await seedInscribedDancer();
    const readFinanceRow = async () => {
      const detail = await readAcademyEventOperationalFinanceDetail({
        academyId: fixture.academyId,
        eventId: fixture.eventId,
      });

      return detail.choreographyFinanceRows.find(
        (row) => row.id === fixture.choreography.id,
      );
    };
    // Withdrawn first: the guard refuses to archive a participant, and the
    // snapshot has to be of the shape archiving actually runs against.
    await withdrawInscription(fixture.inscriptionId);
    const before = await readFinanceRow();

    await setRosterPersonStatus({
      academyId: fixture.academyId,
      kind: "dancer",
      next: "archived",
      personId: fixture.dancer.id,
      surface: "portal",
    });

    expect(before).toBeDefined();
    expect(await readFinanceRow()).toEqual(before);
  });

  test("takes an archived dancer out of the pickers and puts them back on reactivation, with nothing else asked for", async () => {
    const fixture = await seedInscribedDancer();
    await withdrawInscription(fixture.inscriptionId);
    const readOptionIds = async () =>
      (await listDancerOptionsForChoreography(fixture.academyId, [])).map(
        (option) => option.id,
      );

    await setRosterPersonStatus({
      academyId: fixture.academyId,
      kind: "dancer",
      next: "archived",
      personId: fixture.dancer.id,
      surface: "portal",
    });

    expect(await readOptionIds()).not.toContain(fixture.dancer.id);
    // Archiving is grandfathered: the choreography they are already on keeps them.
    const linkedOptions = await listDancerOptionsForChoreography(
      fixture.academyId,
      [fixture.dancer.id],
    );
    expect(linkedOptions.map((option) => option.id)).toContain(
      fixture.dancer.id,
    );

    const reactivated = await setRosterPersonStatus({
      academyId: fixture.academyId,
      kind: "dancer",
      next: "active",
      personId: fixture.dancer.id,
      surface: "portal",
    });

    expect(reactivated.ok && reactivated.person.active).toBe(true);
    expect(await readOptionIds()).toContain(fixture.dancer.id);
  });

  test("archives a professor from the admin panel, which scopes by no academy", async () => {
    const fixture = await seedInscribedDancer();
    const professor = await createProfessor(fixture.academyId, {
      firstName: "Cami",
      lastName: "Profe",
    });

    const archived = await setRosterPersonStatus({
      academyId: null,
      kind: "professor",
      next: "archived",
      personId: professor.id,
      surface: "admin",
    });

    expect(archived.ok && archived.person.active).toBe(false);
    const reactivated = await setRosterPersonStatus({
      academyId: null,
      kind: "professor",
      next: "active",
      personId: professor.id,
      surface: "admin",
    });
    expect(reactivated.ok && reactivated.person.active).toBe(true);
    const [row] = await db
      .select({ active: professors.active })
      .from(professors)
      .where(eq(professors.id, professor.id));
    expect(row?.active).toBe(true);
  });

  test("refuses to write a person of another academy from the portal", async () => {
    const fixture = await seedInscribedDancer();
    const otherAcademy = await createAcademyRecord({
      academyName: "Academia Vecina",
      email: `vecina.${crypto.randomUUID()}@example.com`,
    });

    // Not a thrown `Response`: the status code is the route's to decide, so the
    // module reports the cause and the route turns it into a 404.
    await expect(
      setRosterPersonStatus({
        academyId: otherAcademy.id,
        kind: "dancer",
        next: "archived",
        personId: fixture.dancer.id,
        surface: "portal",
      }),
    ).resolves.toEqual({ ok: false, cause: "not-found" });

    const [row] = await db
      .select({ active: dancers.active })
      .from(dancers)
      .where(eq(dancers.id, fixture.dancer.id));
    expect(row?.active).toBe(true);
  });

  test("asserts that a portal caller always supplies its academy", async () => {
    const fixture = await seedInscribedDancer();

    await expect(
      setRosterPersonStatus({
        academyId: null,
        kind: "dancer",
        next: "archived",
        personId: fixture.dancer.id,
        surface: "portal",
      }),
    ).rejects.toThrow(/its own academy/);

    const [row] = await db
      .select({ active: dancers.active })
      .from(dancers)
      .where(eq(dancers.id, fixture.dancer.id));
    expect(row?.active).toBe(true);
  });
});

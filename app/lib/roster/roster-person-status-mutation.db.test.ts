import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographyDancers, dancers, prices, professors } from "@/db/schema";
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
 * One academy, one choreography of the current event and one dancer inscribed in
 * it at the catalogue price: the shape that would break if archiving ever grew
 * a guard or touched an inscription.
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

describe.sequential("setRosterPersonStatus", () => {
  test("archives a dancer with an active inscription in the current event without touching the inscription", async () => {
    const fixture = await seedInscribedDancer();
    const inscriptionBefore = await readInscription(fixture.inscriptionId);

    const archived = await setRosterPersonStatus({
      academyId: fixture.academyId,
      kind: "dancer",
      next: "archived",
      personId: fixture.dancer.id,
      surface: "portal",
    });

    expect(archived.active).toBe(false);
    expect(await readInscription(fixture.inscriptionId)).toEqual(
      inscriptionBefore,
    );
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

    expect(reactivated.active).toBe(true);
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

    expect(archived.active).toBe(false);
    const reactivated = await setRosterPersonStatus({
      academyId: null,
      kind: "professor",
      next: "active",
      personId: professor.id,
      surface: "admin",
    });
    expect(reactivated.active).toBe(true);
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

    await expect(
      setRosterPersonStatus({
        academyId: otherAcademy.id,
        kind: "dancer",
        next: "archived",
        personId: fixture.dancer.id,
        surface: "portal",
      }),
    ).rejects.toBeInstanceOf(Response);

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
    ).rejects.toThrow(/academia/);

    const [row] = await db
      .select({ active: dancers.active })
      .from(dancers)
      .where(eq(dancers.id, fixture.dancer.id));
    expect(row?.active).toBe(true);
  });
});

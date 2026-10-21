import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  events,
  presentations,
} from "@/db/schema";
import {
  createDancer,
  createSelectedPriceInscriptionForTest,
} from "@/features/portal/choreographies/test-support/db";
import { activateEvent } from "@/lib/events/management.server";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { publishResults } from "@/lib/judging/results.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";
import { readChoreographyCertificates } from "./certificates.server";

installDatabaseTestHooks();

/**
 * A presentation scored 85 (`Medalla de plata`) whose seeded dancer is Ana
 * Paz; the results are published unless a test says otherwise.
 */
async function seedScoredPresentation(input: { publish?: boolean } = {}) {
  const fixture = await seedJudgingFixture();
  await activateEvent(fixture.event.id);
  const presentation = await fixture.addPresentation({
    name: "Río Arriba",
    orderNumber: 1,
  });
  await fixture.scorePresentation(presentation.presentationId, "85.0");

  if (input.publish !== false) {
    await publishResults(fixture.event.id);
  }

  return { fixture, presentation };
}

describe("readChoreographyCertificates", () => {
  test("issues one to each dancer still inscribed, by last name, with the award", async () => {
    const { fixture, presentation } = await seedScoredPresentation();
    const academyId = fixture.academy.academy.id;
    const choreographyId = presentation.choreographyId;
    const zoe = await createDancer(academyId, {
      firstName: "Zoe",
      lastName: "Albornoz",
    });
    const withdrawn = await createDancer(academyId, {
      firstName: "Bruno",
      lastName: "Bianchi",
    });
    await createSelectedPriceInscriptionForTest({
      academyId,
      choreographyId,
      dancerId: zoe.id,
    });
    await createSelectedPriceInscriptionForTest({
      academyId,
      choreographyId,
      dancerId: withdrawn.id,
    });
    await db
      .update(choreographyDancers)
      .set({ withdrawnAt: new Date() })
      .where(eq(choreographyDancers.dancerId, withdrawn.id));

    const certificates = await readChoreographyCertificates(choreographyId);

    expect(certificates).toMatchObject({
      academyId,
      award: "silver",
      choreographyName: "Río Arriba",
      eventId: fixture.event.id,
      template: { year: 2026 },
    });
    expect(certificates?.recipients).toEqual([
      { dancerId: zoe.id, name: "Zoe Albornoz" },
      { dancerId: expect.any(String), name: "Ana Paz" },
    ]);
  });

  test("issues none while the result is not published", async () => {
    const { presentation } = await seedScoredPresentation({ publish: false });

    expect(
      await readChoreographyCertificates(presentation.choreographyId),
    ).toBeNull();
  });

  test("issues none for a disqualified presentation", async () => {
    const { presentation } = await seedScoredPresentation();
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.id, presentation.presentationId));

    expect(
      await readChoreographyCertificates(presentation.choreographyId),
    ).toBeNull();
  });

  test("issues none once no dancer is inscribed any more", async () => {
    const { presentation } = await seedScoredPresentation();
    await db
      .update(choreographyDancers)
      .set({ withdrawnAt: new Date() })
      .where(
        eq(choreographyDancers.choreographyId, presentation.choreographyId),
      );

    expect(
      await readChoreographyCertificates(presentation.choreographyId),
    ).toBeNull();
  });

  test("issues none for a withdrawn choreography", async () => {
    const { presentation } = await seedScoredPresentation();
    await db
      .update(choreographies)
      .set({ withdrawnAt: new Date() })
      .where(eq(choreographies.id, presentation.choreographyId));

    expect(
      await readChoreographyCertificates(presentation.choreographyId),
    ).toBeNull();
  });

  test("issues none for an event whose year has no template", async () => {
    const { fixture, presentation } = await seedScoredPresentation();
    await db
      .update(events)
      .set({
        endsAt: new Date("2027-05-03T12:00:00Z"),
        startsAt: new Date("2027-05-01T12:00:00Z"),
      })
      .where(eq(events.id, fixture.event.id));

    expect(
      await readChoreographyCertificates(presentation.choreographyId),
    ).toBeNull();
  });
});

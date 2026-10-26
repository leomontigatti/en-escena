import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographyDancers, events, presentations } from "@/db/schema";
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
 * Paz, with the results published. Whether a reader reaches the result at
 * all is `presentation-results.server.ts`'s, tested there.
 */
async function seedScoredPresentation() {
  const fixture = await seedJudgingFixture();
  await activateEvent(fixture.event.id);
  const presentation = await fixture.addPresentation({
    name: "Río Arriba",
    orderNumber: 1,
  });
  await fixture.scorePresentation(presentation.presentationId, "85.0");

  await publishResults(fixture.event.id);

  return {
    audience: {
      academyId: fixture.academy.academy.id,
      kind: "academy",
    } as const,
    fixture,
    presentation,
  };
}

describe("readChoreographyCertificates", () => {
  test("issues one to each dancer still inscribed, by last name, with the award", async () => {
    const { audience, fixture, presentation } = await seedScoredPresentation();
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

    const certificates = await readChoreographyCertificates(
      audience,
      choreographyId,
    );

    expect(certificates).toMatchObject({
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

  test("issues none for a disqualified presentation", async () => {
    const { audience, presentation } = await seedScoredPresentation();
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.id, presentation.presentationId));

    expect(
      await readChoreographyCertificates(audience, presentation.choreographyId),
    ).toBeNull();
  });

  test("issues none once no dancer is inscribed any more", async () => {
    const { audience, presentation } = await seedScoredPresentation();
    await db
      .update(choreographyDancers)
      .set({ withdrawnAt: new Date() })
      .where(
        eq(choreographyDancers.choreographyId, presentation.choreographyId),
      );

    expect(
      await readChoreographyCertificates(audience, presentation.choreographyId),
    ).toBeNull();
  });

  test("issues none for an event whose year has no template", async () => {
    const { audience, fixture, presentation } = await seedScoredPresentation();
    await db
      .update(events)
      .set({
        endsAt: new Date("2027-05-03T12:00:00Z"),
        startsAt: new Date("2027-05-01T12:00:00Z"),
      })
      .where(eq(events.id, fixture.event.id));

    expect(
      await readChoreographyCertificates(audience, presentation.choreographyId),
    ).toBeNull();
  });
});

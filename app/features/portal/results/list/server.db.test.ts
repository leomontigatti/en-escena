import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { presentations, scores } from "@/db/schema";
import {
  createAcademySession,
  createChoreographyRecord,
} from "@/features/portal/choreographies/test-support/db";
import { activateEvent } from "@/lib/events/management.server";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { hideResults, publishResults } from "@/lib/judging/results.server";
import { setVisibleProgramDays } from "@/lib/presentations/program-visibility.server";

import { loadPortalResultsList } from "./server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

type JudgingFixture = Awaited<ReturnType<typeof seedJudgingFixture>>;

const presentationDay = "2026-05-01";

async function seedActiveFixture() {
  const fixture = await seedJudgingFixture();
  await activateEvent(fixture.event.id);
  await setVisibleProgramDays(fixture.event.id, [presentationDay]);

  return fixture;
}

async function score(
  fixture: JudgingFixture,
  presentationId: string,
  values: string[],
) {
  for (const value of values) {
    const { judgeAssignmentId } = await fixture.assignJudge(presentationId);
    await db.insert(scores).values({ judgeAssignmentId, value });
  }
}

async function loadTheList(cookie: string) {
  return await loadPortalResultsList(
    new Request("http://localhost/portal/resultados", { headers: { cookie } }),
  );
}

describe("loadPortalResultsList", () => {
  test("lists only the academy's published results, with their live average and award", async () => {
    const fixture = await seedActiveFixture();
    const gold = await fixture.addPresentation({
      name: "Oro",
      orderNumber: 2,
      scheduledDate: presentationDay,
    });
    const silver = await fixture.addPresentation({
      name: "Plata",
      orderNumber: 1,
      scheduledDate: presentationDay,
    });
    await score(fixture, gold.presentationId, ["90", "95"]);
    await score(fixture, silver.presentationId, ["80"]);
    await publishResults(fixture.event.id);
    // Scored after publishing: outside the snapshot until `Actualizar`.
    const late = await fixture.addPresentation({
      name: "Tardía",
      orderNumber: 3,
      scheduledDate: presentationDay,
    });
    await score(fixture, late.presentationId, ["70"]);

    const loaderData = await loadTheList(fixture.academy.cookie);

    expect(loaderData.hasActiveEvent).toBe(true);
    expect(
      loaderData.rows.map((row) => [
        row.name,
        row.orderNumber,
        row.average,
        row.award,
        row.disqualified,
      ]),
    ).toEqual([
      ["Plata", 1, 80, "silver", false],
      ["Oro", 2, 92.5, "gold", false],
    ]);
  });

  test("reads a disqualified result with no average and no award", async () => {
    const fixture = await seedActiveFixture();
    const presentation = await fixture.addPresentation({
      name: "Descalificada",
      orderNumber: 1,
      scheduledDate: presentationDay,
    });
    await score(fixture, presentation.presentationId, ["95"]);
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.id, presentation.presentationId));
    await publishResults(fixture.event.id);

    const loaderData = await loadTheList(fixture.academy.cookie);

    expect(loaderData.rows).toMatchObject([
      { average: null, award: null, disqualified: true, name: "Descalificada" },
    ]);
  });

  test("leaves out another academy's published results in the same event", async () => {
    const fixture = await seedActiveFixture();
    const own = await fixture.addPresentation({
      name: "Propia",
      orderNumber: 1,
      scheduledDate: presentationDay,
    });
    await score(fixture, own.presentationId, ["85"]);

    const stranger = await createAcademySession({
      academyName: "Academia Ajena",
      email: "resultados.ajena@example.com",
    });
    const foreign = await createChoreographyRecord({
      academyId: stranger.academyId,
      categoryId: fixture.catalog.categoryWithLevel.id,
      eventId: fixture.event.id,
      experienceLevelId: fixture.catalog.level.id,
      modalityId: fixture.catalog.modality.id,
      name: "Ajena",
      scheduleCapacityId: fixture.catalog.scheduleCapacity.id,
    });
    // Disqualified counts as evaluated, so it enters the snapshot with no panel.
    await db.insert(presentations).values({
      choreographyId: foreign.id,
      disqualifiedAt: new Date(),
      eventId: fixture.event.id,
      orderNumber: 2,
    });
    await publishResults(fixture.event.id);

    const ownList = await loadTheList(fixture.academy.cookie);
    const strangerList = await loadTheList(stranger.cookie);

    expect(ownList.rows.map((row) => row.name)).toEqual(["Propia"]);
    expect(strangerList.rows.map((row) => row.name)).toEqual(["Ajena"]);
  });

  test("lists nothing before publishing and again once results are hidden", async () => {
    const fixture = await seedActiveFixture();
    const presentation = await fixture.addPresentation({
      name: "Evaluada",
      orderNumber: 1,
      scheduledDate: presentationDay,
    });
    await score(fixture, presentation.presentationId, ["85"]);

    expect((await loadTheList(fixture.academy.cookie)).rows).toEqual([]);

    await publishResults(fixture.event.id);
    expect((await loadTheList(fixture.academy.cookie)).rows).toHaveLength(1);

    await hideResults(fixture.event.id);
    expect((await loadTheList(fixture.academy.cookie)).rows).toEqual([]);
  });

  test("answers with no event when none is active", async () => {
    const session = await createAcademySession({
      academyName: "Academia Sin Evento",
      email: "resultados.sin-evento@example.com",
    });

    const loaderData = await loadTheList(session.cookie);

    expect(loaderData).toEqual({ hasActiveEvent: false, rows: [] });
  });
});

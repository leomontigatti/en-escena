import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { scores } from "@/db/schema";
import { createAcademySession } from "@/features/portal/choreographies/test-support/db";
import { activateEvent } from "@/lib/events/management.server";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { publishResults } from "@/lib/judging/results.server";
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
      loaderData.rows.map((row) => [row.name, row.orderNumber, row.result]),
    ).toEqual([
      ["Plata", 1, { average: 80, award: "silver", kind: "scored" }],
      ["Oro", 2, { average: 92.5, award: "gold", kind: "scored" }],
    ]);
  });

  test("tells results not published yet apart from published with none of the academy's", async () => {
    const fixture = await seedActiveFixture();
    // Placed but never evaluated, so publishing leaves it out of the snapshot.
    await fixture.addPresentation({
      name: "Sin evaluar",
      orderNumber: 1,
      scheduledDate: presentationDay,
    });

    const beforePublishing = await loadTheList(fixture.academy.cookie);
    await publishResults(fixture.event.id);
    const afterPublishing = await loadTheList(fixture.academy.cookie);

    expect(beforePublishing).toMatchObject({
      areResultsPublished: false,
      rows: [],
    });
    expect(afterPublishing).toMatchObject({
      areResultsPublished: true,
      rows: [],
    });
  });

  test("answers with no event when none is active", async () => {
    const session = await createAcademySession({
      academyName: "Academia Sin Evento",
      email: "resultados.sin-evento@example.com",
    });

    const loaderData = await loadTheList(session.cookie);

    expect(loaderData).toEqual({
      areResultsPublished: false,
      hasActiveEvent: false,
      rows: [],
    });
  });
});

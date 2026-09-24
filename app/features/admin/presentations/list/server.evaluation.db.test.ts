import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { presentations, scores } from "@/db/schema";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";

import { loadPresentationListRouteData } from "./server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const listUrl = "http://localhost/administracion/presentacion";

async function loadTheList(email: string) {
  const { request } = await createSignedInAdminRequest({
    email,
    requestUrl: listUrl,
    role: "admin",
  });

  return await loadPresentationListRouteData(request);
}

/**
 * What the administrative list says about a presentation the panel has
 * reached: its evaluation status, which drives the row's badge and where its
 * name leads, and the level the new column shows.
 */
describe("the participation list's evaluation status", () => {
  test("reads a scored presentation as evaluated and an untouched one as pending", async () => {
    const fixture = await seedJudgingFixture();
    const scored = await fixture.addPresentation({
      name: "Puntuada",
      orderNumber: 1,
    });
    const untouched = await fixture.addPresentation({
      name: "Sin puntaje",
      orderNumber: 2,
    });
    const { judgeAssignmentId } = await fixture.assignJudge(
      scored.presentationId,
    );
    await db.insert(scores).values({ judgeAssignmentId, value: "90" });

    const result = await loadTheList("evaluada.presentacion@example.com");

    expect(
      result.presentations.find((row) => row.id === scored.choreographyId),
    ).toMatchObject({
      evaluationStatus: "evaluated",
      presentationId: scored.presentationId,
    });
    expect(
      result.presentations.find((row) => row.id === untouched.choreographyId),
    ).toMatchObject({ evaluationStatus: "pending" });
  });

  test("reads a disqualified presentation as disqualified even once it has scores", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Descalificada",
      orderNumber: 1,
    });
    const { judgeAssignmentId } = await fixture.assignJudge(
      presentation.presentationId,
    );
    await db.insert(scores).values({ judgeAssignmentId, value: "90" });
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.id, presentation.presentationId));

    const result = await loadTheList("descalificada.presentacion@example.com");

    expect(result.presentations[0]).toMatchObject({
      evaluationStatus: "disqualified",
    });
  });

  test("carries the choreography's level, and none when it has no level", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({ name: "Con nivel", orderNumber: 1 });
    await fixture.addPresentation({
      experienceLevelId: null,
      name: "Sin nivel",
      orderNumber: 2,
    });

    const result = await loadTheList("nivel.presentacion@example.com");

    expect(result.presentations.map((row) => row.experienceLevel)).toEqual([
      fixture.catalog.level.id,
      null,
    ]);
  });
});

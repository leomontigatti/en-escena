import { describe, expect, test } from "vitest";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { presentations, scores } from "@/db/schema";
import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";

import {
  handlePresentationScoresAction,
  loadPresentationScoresRouteData,
} from "./server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

function scoresUrl(presentationId: string) {
  return `http://localhost/administracion/presentacion/${presentationId}/puntajes`;
}

async function seedScoredPresentation() {
  const fixture = await seedJudgingFixture();
  const presentation = await fixture.addPresentation({
    name: "Primera",
    orderNumber: 1,
    submodalityId: null,
  });
  const judge = await fixture.assignJudge(presentation.presentationId);
  const [score] = await db
    .insert(scores)
    .values({ judgeAssignmentId: judge.judgeAssignmentId, value: "90.0" })
    .returning();

  return { ...presentation, scoreId: score.id };
}

async function submitAsAdmin(
  presentationId: string,
  fields: Record<string, string>,
) {
  const body = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    body.set(key, value);
  }

  const { request } = await createSignedInRequest({
    body,
    email: `admin.${crypto.randomUUID()}@example.com`,
    requestUrl: scoresUrl(presentationId),
    role: "admin",
  });

  return await handlePresentationScoresAction({
    params: { presentationId },
    request,
  });
}

describe("the presentation's scores route", () => {
  test("lets an administrator read the panel and gives them the edits", async () => {
    const presentation = await seedScoredPresentation();
    const { request } = await createSignedInRequest({
      email: "admin.puntajes@example.com",
      requestUrl: scoresUrl(presentation.presentationId),
      role: "admin",
    });

    await expect(
      loadPresentationScoresRouteData({
        params: { presentationId: presentation.presentationId },
        request,
      }),
    ).resolves.toMatchObject({
      canEdit: true,
      presentation: { average: 90, medal: "oro", name: "Primera" },
    });
  });

  test("lets an auditor read it and withholds the edits", async () => {
    const presentation = await seedScoredPresentation();
    const { request } = await createSignedInRequest({
      email: "auditor.puntajes@example.com",
      requestUrl: scoresUrl(presentation.presentationId),
      role: "auditor",
    });

    await expect(
      loadPresentationScoresRouteData({
        params: { presentationId: presentation.presentationId },
        request,
      }),
    ).resolves.toMatchObject({ canEdit: false });
  });

  test("turns an academy away from the panel", async () => {
    const presentation = await seedScoredPresentation();
    const { request } = await createSignedInRequest({
      email: "academia.puntajes@example.com",
      requestUrl: scoresUrl(presentation.presentationId),
      role: "academy",
    });

    await expectThrownResponse(
      loadPresentationScoresRouteData({
        params: { presentationId: presentation.presentationId },
        request,
      }),
      403,
    );
  });

  test("answers 404 for a presentation that does not exist", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.inexistente@example.com",
      requestUrl: scoresUrl("00000000-0000-0000-0000-000000000000"),
      role: "admin",
    });

    await expectThrownResponse(
      loadPresentationScoresRouteData({
        params: { presentationId: "00000000-0000-0000-0000-000000000000" },
        request,
      }),
      404,
    );
  });

  test("refuses an auditor's write", async () => {
    const presentation = await seedScoredPresentation();
    const body = new FormData();

    body.set("intent", "edit-score");

    const { request } = await createSignedInRequest({
      body,
      email: "auditor.escribe@example.com",
      requestUrl: scoresUrl(presentation.presentationId),
      role: "auditor",
    });

    await expectThrownResponse(
      handlePresentationScoresAction({
        params: { presentationId: presentation.presentationId },
        request,
      }),
      403,
    );
  });
});

describe("the scores route's writes", () => {
  test("stores an administrator's corrected score", async () => {
    const presentation = await seedScoredPresentation();

    const result = await submitAsAdmin(presentation.presentationId, {
      intent: "edit-score",
      scoreId: presentation.scoreId,
      value: "77.5",
    });

    expect(result).toMatchObject({ status: "success" });

    const [row] = await db
      .select({ value: scores.value })
      .from(scores)
      .where(eq(scores.id, presentation.scoreId));

    expect(row.value).toBe("77.5");
  });

  test("answers a refused value with a field error on the score", async () => {
    const presentation = await seedScoredPresentation();

    const result = await submitAsAdmin(presentation.presentationId, {
      intent: "edit-score",
      scoreId: presentation.scoreId,
      value: "77.3",
    });

    expect(result).toMatchObject({
      fieldErrors: { [presentation.scoreId]: expect.stringContaining("0.5") },
      status: "error",
    });
  });

  test("annuls a score and restores it", async () => {
    const presentation = await seedScoredPresentation();

    await submitAsAdmin(presentation.presentationId, {
      annulled: "true",
      intent: "annul-score",
      scoreId: presentation.scoreId,
    });

    const [annulled] = await db
      .select({ annulled: scores.annulled })
      .from(scores)
      .where(eq(scores.id, presentation.scoreId));

    expect(annulled.annulled).toBe(true);

    await submitAsAdmin(presentation.presentationId, {
      annulled: "false",
      intent: "annul-score",
      scoreId: presentation.scoreId,
    });

    const [restored] = await db
      .select({ annulled: scores.annulled })
      .from(scores)
      .where(eq(scores.id, presentation.scoreId));

    expect(restored.annulled).toBe(false);
  });

  test("disqualifies and reinstates the presentation", async () => {
    const presentation = await seedScoredPresentation();

    await submitAsAdmin(presentation.presentationId, { intent: "disqualify" });

    const [closed] = await db
      .select({ disqualifiedAt: presentations.disqualifiedAt })
      .from(presentations)
      .where(eq(presentations.id, presentation.presentationId));

    expect(closed.disqualifiedAt).not.toBeNull();

    await submitAsAdmin(presentation.presentationId, { intent: "reinstate" });

    const [reopened] = await db
      .select({ disqualifiedAt: presentations.disqualifiedAt })
      .from(presentations)
      .where(eq(presentations.id, presentation.presentationId));

    expect(reopened.disqualifiedAt).toBeNull();
  });

  test("names the presentation, not a score, when a disqualification finds nothing", async () => {
    const presentation = await seedScoredPresentation();

    const result = await submitAsAdmin(presentation.presentationId, {
      intent: "annul-score",
      annulled: "true",
      scoreId: "00000000-0000-0000-0000-000000000000",
    });

    expect(result).toMatchObject({
      data: { message: "No se encontró el puntaje que se quiso editar." },
    });

    const missing = await submitAsAdmin(
      "00000000-0000-0000-0000-000000000000",
      { intent: "disqualify" },
    );

    expect(missing).toMatchObject({
      data: { message: "No se encontró la presentación buscada." },
    });
  });

  test("refuses a score that does not belong to the presentation", async () => {
    const presentation = await seedScoredPresentation();
    const other = await seedScoredPresentation();

    const result = await submitAsAdmin(presentation.presentationId, {
      intent: "edit-score",
      scoreId: other.scoreId,
      value: "60",
    });

    expect(result).toMatchObject({ data: { status: "error" } });

    const [row] = await db
      .select({ value: scores.value })
      .from(scores)
      .where(eq(scores.id, other.scoreId));

    expect(row.value).toBe("90.0");
  });
});

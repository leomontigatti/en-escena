import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { presentations, scoreCriterionValues, scores, user } from "@/db/schema";
import { loadPortalPresentationEvaluation } from "@/features/portal/presentations/detail/server";
import { activateEvent } from "@/lib/events/management.server";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { hideResults, publishResults } from "@/lib/judging/results.server";
import { createFeedbackAudioStorage } from "@/lib/storage/feedback-audio.server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const signingStorage = createFeedbackAudioStorage({
  createSignedUrl: async (input) => `https://example.test/${input.key}`,
  remove: async () => {},
  upload: async () => {},
});

type JudgingFixture = Awaited<ReturnType<typeof seedJudgingFixture>>;

async function seedPublishedEvaluation() {
  const fixture = await seedJudgingFixture();
  await activateEvent(fixture.event.id);

  const presentation = await fixture.addPresentation({
    name: "Primera",
    orderNumber: 1,
    submodalityId: null,
  });

  return { fixture, presentation };
}

function evaluationRequest(fixture: JudgingFixture) {
  return new Request("http://localhost/portal/presentaciones", {
    headers: { cookie: fixture.academy.cookie },
  });
}

async function loadEvaluation(fixture: JudgingFixture, choreographyId: string) {
  return await loadPortalPresentationEvaluation({
    params: { choreographyId },
    request: evaluationRequest(fixture),
    storage: signingStorage,
  });
}

async function nameJudge(judgeId: string, name: string) {
  await db.update(user).set({ name }).where(eq(user.id, judgeId));
}

describe("an academy's evaluation detail", () => {
  test("shows the medal, the average and a card per judge that scored", async () => {
    const { fixture, presentation } = await seedPublishedEvaluation();
    const scored = await fixture.assignJudge(presentation.presentationId);
    const silent = await fixture.assignJudge(presentation.presentationId);
    const annulled = await fixture.assignJudge(presentation.presentationId);

    await nameJudge(scored.judgeId, "Ana Juez");
    await nameJudge(silent.judgeId, "Beto Juez");
    await nameJudge(annulled.judgeId, "Carla Juez");
    await db.insert(scores).values([
      {
        feedbackAudioStorageKey: "takes/a.webm",
        judgeAssignmentId: scored.judgeAssignmentId,
        value: "92.0",
      },
      {
        annulled: true,
        judgeAssignmentId: annulled.judgeAssignmentId,
        value: "10.0",
      },
    ]);
    await publishResults(fixture.event.id);

    const loaderData = await loadEvaluation(
      fixture,
      presentation.choreographyId,
    );

    expect(loaderData.title).toBe("N.º 1 · Primera");
    expect(loaderData.details).toContain("Solo");
    expect(loaderData.average).toBe(92);
    expect(loaderData.medal).toBe("gold");
    expect(loaderData.judges).toEqual([
      {
        criteriaValues: {},
        feedbackAudioUrl: "https://example.test/takes/a.webm",
        judgeId: scored.judgeId,
        judgeName: "Ana Juez",
        value: "92.0",
      },
    ]);
  });

  test("answers not found for another academy's presentation", async () => {
    const { fixture, presentation } = await seedPublishedEvaluation();
    const judge = await fixture.assignJudge(presentation.presentationId);

    await db.insert(scores).values({
      judgeAssignmentId: judge.judgeAssignmentId,
      value: "80.0",
    });
    await publishResults(fixture.event.id);

    const stranger = await seedJudgingFixture();

    await expect(
      loadEvaluation(stranger, presentation.choreographyId),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("answers not found before publishing and again once results are hidden", async () => {
    const { fixture, presentation } = await seedPublishedEvaluation();
    const judge = await fixture.assignJudge(presentation.presentationId);

    await db.insert(scores).values({
      judgeAssignmentId: judge.judgeAssignmentId,
      value: "80.0",
    });

    await expect(
      loadEvaluation(fixture, presentation.choreographyId),
    ).rejects.toMatchObject({ status: 404 });

    await publishResults(fixture.event.id);
    await expect(
      loadEvaluation(fixture, presentation.choreographyId),
    ).resolves.toMatchObject({ average: 80 });

    await hideResults(fixture.event.id);
    await expect(
      loadEvaluation(fixture, presentation.choreographyId),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("keeps only the feedback of a disqualified presentation", async () => {
    const { fixture, presentation } = await seedPublishedEvaluation();
    const judge = await fixture.assignJudge(presentation.presentationId);

    await nameJudge(judge.judgeId, "Ana Juez");
    await db.insert(scores).values({
      feedbackAudioStorageKey: "takes/a.webm",
      judgeAssignmentId: judge.judgeAssignmentId,
      value: "92.0",
    });
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.id, presentation.presentationId));
    await publishResults(fixture.event.id);

    const loaderData = await loadEvaluation(
      fixture,
      presentation.choreographyId,
    );

    expect(loaderData).toMatchObject({
      average: null,
      criteria: [],
      disqualified: true,
      medal: null,
    });
    expect(loaderData.judges).toEqual([
      {
        criteriaValues: {},
        feedbackAudioUrl: "https://example.test/takes/a.webm",
        judgeId: judge.judgeId,
        judgeName: "Ana Juez",
        value: null,
      },
    ]);
  });

  test("reads a correction made after publishing", async () => {
    const { fixture, presentation } = await seedPublishedEvaluation();
    const judge = await fixture.assignJudge(presentation.presentationId);
    const [score] = await db
      .insert(scores)
      .values({ judgeAssignmentId: judge.judgeAssignmentId, value: "50.0" })
      .returning();

    await publishResults(fixture.event.id);
    await db
      .update(scores)
      .set({ value: "95.0" })
      .where(eq(scores.id, score.id));

    await expect(
      loadEvaluation(fixture, presentation.choreographyId),
    ).resolves.toMatchObject({ average: 95, medal: "gold" });
  });

  test("carries the sheet a criteria-judged presentation was scored on", async () => {
    const fixture = await seedJudgingFixture();
    await activateEvent(fixture.event.id);
    const adds = await fixture.addCriterion({
      maximum: 100,
      name: "Técnica",
      position: 0,
    });
    const deducts = await fixture.addCriterion({
      kind: "deducts",
      maximum: 10,
      name: "Caídas",
      position: 1,
    });
    const presentation = await fixture.addPresentation({
      name: "Con planilla",
      orderNumber: 1,
    });
    const judge = await fixture.assignJudge(presentation.presentationId);
    const [score] = await db
      .insert(scores)
      .values({ judgeAssignmentId: judge.judgeAssignmentId, value: "88.0" })
      .returning();

    await db.insert(scoreCriterionValues).values([
      { criterionId: adds.id, scoreId: score.id, value: "90.0" },
      { criterionId: deducts.id, scoreId: score.id, value: "2.0" },
    ]);
    await publishResults(fixture.event.id);

    const loaderData = await loadEvaluation(
      fixture,
      presentation.choreographyId,
    );

    expect(loaderData.criteria.map((criterion) => criterion.name)).toEqual([
      "Técnica",
      "Caídas",
    ]);
    expect(loaderData.judges[0].criteriaValues).toEqual({
      [adds.id]: "90.0",
      [deducts.id]: "2.0",
    });
  });
});

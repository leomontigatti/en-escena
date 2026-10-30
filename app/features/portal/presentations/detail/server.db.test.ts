import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { scoreCriterionValues, scores, user } from "@/db/schema";
import { loadPortalPresentationEvaluation } from "@/features/portal/presentations/detail/server";
import { activateEvent } from "@/lib/events/management.server";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { hideResults, publishResults } from "@/lib/judging/results.server";
import { setVisibleProgramDays } from "@/lib/presentations/program-visibility.server";
import { createFeedbackAudioStorage } from "@/lib/storage/feedback-audio.server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const signingStorage = createFeedbackAudioStorage({
  createSignedUrl: async (input) => `https://example.test/${input.key}`,
  remove: async () => {},
  upload: async () => {},
});

type JudgingFixture = Awaited<ReturnType<typeof seedJudgingFixture>>;

/** The day the seeded presentation dances, published unless a test hides it. */
const presentationDay = "2026-05-01";

async function seedPublishedEvaluation(
  choreography: Pick<
    Parameters<JudgingFixture["addPresentation"]>[0],
    "experienceLevelId" | "groupType"
  > = {},
) {
  const fixture = await seedJudgingFixture();
  await activateEvent(fixture.event.id);

  const presentation = await fixture.addPresentation({
    ...choreography,
    name: "Primera",
    orderNumber: 1,
    scheduledDate: presentationDay,
    submodalityId: null,
  });
  await setVisibleProgramDays(fixture.event.id, [presentationDay]);

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
  test("shows the award, the average and a card per judge that scored", async () => {
    const { fixture, presentation } = await seedPublishedEvaluation();
    const scored = await fixture.assignJudge(presentation.presentationId);
    const silent = await fixture.assignJudge(presentation.presentationId);
    const other = await fixture.assignJudge(presentation.presentationId);

    await nameJudge(scored.judgeId, "Ana Juez");
    await nameJudge(silent.judgeId, "Beto Juez");
    await nameJudge(other.judgeId, "Carla Juez");
    await db.insert(scores).values([
      {
        feedbackAudioStorageKey: "takes/a.webm",
        judgeAssignmentId: scored.judgeAssignmentId,
        value: "92.0",
      },
      { judgeAssignmentId: other.judgeAssignmentId, value: "88.0" },
    ]);
    await publishResults(fixture.event.id);

    const loaderData = await loadEvaluation(
      fixture,
      presentation.choreographyId,
    );

    expect(loaderData.title).toBe("Primera · N.º 1");
    expect(loaderData.details).toContain("Solo");
    expect(loaderData.result).toEqual({
      average: 90,
      award: "gold",
      kind: "scored",
    });
    // Its seeded dancer, whose certificate the page offers, under the
    // choreography's name without the number the title carries.
    expect(loaderData.certificates).toEqual({
      choreographyId: presentation.choreographyId,
      choreographyName: "Primera",
      recipients: [{ dancerId: expect.any(String), name: "Ana Paz" }],
    });
    expect(loaderData.judges).toEqual([
      {
        criteriaValues: {},
        feedbackAudioUrl: "https://example.test/takes/a.webm",
        judgeId: scored.judgeId,
        judgeName: "Ana Juez",
        value: "92.0",
      },
      {
        criteriaValues: {},
        feedbackAudioUrl: null,
        judgeId: other.judgeId,
        judgeName: "Carla Juez",
        value: "88.0",
      },
    ]);
  });

  // A published result does not publish its day's order: the number stays
  // withheld, as on the academy's list, and the result itself still answers.
  test("names the presentation without its number while its day is not published", async () => {
    const { fixture, presentation } = await seedPublishedEvaluation();
    const scored = await fixture.assignJudge(presentation.presentationId);

    await db
      .insert(scores)
      .values({ judgeAssignmentId: scored.judgeAssignmentId, value: "90.0" });
    await publishResults(fixture.event.id);
    await setVisibleProgramDays(fixture.event.id, []);

    const loaderData = await loadEvaluation(
      fixture,
      presentation.choreographyId,
    );

    expect(loaderData.title).toBe("Primera");
    expect(loaderData.result).toMatchObject({ average: 90 });
    expect(JSON.stringify(loaderData)).not.toContain("N.º");
  });

  test("words a grupal's empty level by why it is empty", async () => {
    const { fixture, presentation } = await seedPublishedEvaluation({
      experienceLevelId: null,
      groupType: "grupal",
    });
    const scored = await fixture.assignJudge(presentation.presentationId);

    await db
      .insert(scores)
      .values({ judgeAssignmentId: scored.judgeAssignmentId, value: "90.0" });
    await publishResults(fixture.event.id);

    const loaderData = await loadEvaluation(
      fixture,
      presentation.choreographyId,
    );

    expect(loaderData.details).toContain("Grupal · Sin nivel");
  });

  test("answers not found for another academy's presentation", async () => {
    const { fixture, presentation } = await seedPublishedEvaluation();
    const judge = await fixture.assignJudge(presentation.presentationId);

    await db.insert(scores).values({
      judgeAssignmentId: judge.judgeAssignmentId,
      value: "80.0",
    });
    await publishResults(fixture.event.id);

    const stranger = await seedJudgingFixture({ active: false });

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
    ).resolves.toMatchObject({ result: { average: 80 } });

    await hideResults(fixture.event.id);
    await expect(
      loadEvaluation(fixture, presentation.choreographyId),
    ).rejects.toMatchObject({ status: 404 });
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
    ).resolves.toMatchObject({
      result: { average: 95, award: "gold", kind: "scored" },
    });
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

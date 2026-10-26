import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { presentations, scoreCriterionValues, scores, user } from "@/db/schema";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { readPresentationEvaluation } from "@/lib/judging/presentation-evaluation.server";
import { hideResults, publishResults } from "@/lib/judging/results.server";
import { createFeedbackAudioStorage } from "@/lib/storage/feedback-audio.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const administration = { kind: "administration" } as const;

const signingStorage = createFeedbackAudioStorage({
  createSignedUrl: async (input) => `https://example.test/${input.key}`,
  remove: async () => {},
  upload: async () => {},
});

describe("a presentation's evaluation, as administration reads it", () => {
  test("shows a row per assigned judge, with the judge without a score apart", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const scored = await fixture.assignJudge(presentation.presentationId);
    const silent = await fixture.assignJudge(presentation.presentationId);

    await db
      .update(user)
      .set({ name: "Zulema Juez" })
      .where(eq(user.id, scored.judgeId));
    await db
      .update(user)
      .set({ name: "Ana Juez" })
      .where(eq(user.id, silent.judgeId));
    await db.insert(scores).values({
      feedbackAudioStorageKey: "takes/a.webm",
      judgeAssignmentId: scored.judgeAssignmentId,
      value: "90.0",
    });

    const view = await readPresentationEvaluation(
      administration,
      { presentationId: presentation.presentationId },
      { storage: signingStorage },
    );

    expect(view?.name).toBe("Primera");
    expect(view?.academyName).toBe(fixture.academy.academy.name);
    expect(view?.choreographyId).toBe(presentation.choreographyId);
    expect(view?.criteria).toEqual([]);
    expect(view?.judges).toMatchObject([
      { judgeName: "Ana Juez", value: null },
      {
        feedbackAudioUrl: "https://example.test/takes/a.webm",
        judgeName: "Zulema Juez",
        value: "90.0",
      },
    ]);
  });

  test("averages every saved score and reads the award off it", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const first = await fixture.assignJudge(presentation.presentationId);
    const second = await fixture.assignJudge(presentation.presentationId);
    const third = await fixture.assignJudge(presentation.presentationId);

    await db.insert(scores).values([
      { judgeAssignmentId: first.judgeAssignmentId, value: "80.0" },
      { judgeAssignmentId: second.judgeAssignmentId, value: "90.0" },
      { judgeAssignmentId: third.judgeAssignmentId, value: "88.5" },
    ]);

    const view = await readPresentationEvaluation(administration, {
      presentationId: presentation.presentationId,
    });

    expect(view?.result).toEqual({
      average: 86.17,
      award: "silver",
      kind: "scored",
    });
    // Nothing takes a saved score out of the average, so no flag says so.
    expect(view?.judges[0]).not.toHaveProperty("annulled");
  });

  test("carries the academy's request for a professional evaluation", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Exigente",
      orderNumber: 1,
      professionalEvaluation: true,
    });

    await expect(
      readPresentationEvaluation(administration, {
        presentationId: presentation.presentationId,
      }),
    ).resolves.toMatchObject({ professionalEvaluation: true });
  });

  test("has no average and no award once the presentation is disqualified", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const judge = await fixture.assignJudge(presentation.presentationId);

    await db.insert(scores).values({
      judgeAssignmentId: judge.judgeAssignmentId,
      value: "90.0",
    });
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.id, presentation.presentationId));

    const view = await readPresentationEvaluation(administration, {
      presentationId: presentation.presentationId,
    });

    expect(view?.result).toEqual({ kind: "disqualified" });
  });

  test("carries each judge's sheet when the submodality has criteria", async () => {
    const fixture = await seedJudgingFixture();
    const technique = await fixture.addCriterion({
      maximum: 100,
      name: "Técnica",
      position: 0,
    });
    const falls = await fixture.addCriterion({
      kind: "deducts",
      maximum: 10,
      name: "Caídas",
      position: 1,
    });
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const judge = await fixture.assignJudge(presentation.presentationId);
    const [score] = await db
      .insert(scores)
      .values({ judgeAssignmentId: judge.judgeAssignmentId, value: "85.5" })
      .returning();

    await db.insert(scoreCriterionValues).values([
      { criterionId: technique.id, scoreId: score.id, value: "90.5" },
      { criterionId: falls.id, scoreId: score.id, value: "5.0" },
    ]);

    const view = await readPresentationEvaluation(administration, {
      presentationId: presentation.presentationId,
    });

    expect(view?.criteria).toMatchObject([
      { kind: "adds", maximum: 100, name: "Técnica" },
      { kind: "deducts", maximum: 10, name: "Caídas" },
    ]);
    expect(view?.judges[0].criteriaValues).toEqual({
      [technique.id]: "90.5",
      [falls.id]: "5.0",
    });
  });

  test("has no sheet for a `Sin nivel` grupal, which is scored with a single value", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addCriterion({ maximum: 100, name: "Técnica", position: 0 });
    const presentation = await fixture.addPresentation({
      experienceLevelId: null,
      groupType: "grupal",
      name: "Grupal sin nivel",
      orderNumber: 1,
    });
    const judge = await fixture.assignJudge(presentation.presentationId);
    await db
      .insert(scores)
      .values({ judgeAssignmentId: judge.judgeAssignmentId, value: "88.0" });

    const view = await readPresentationEvaluation(administration, {
      presentationId: presentation.presentationId,
    });

    expect(view).toMatchObject({
      criteria: [],
      experienceLevel: null,
      experienceLevelRequirement: "optional",
      judges: [{ criteriaValues: {}, value: "88.0" }],
    });
  });

  test("reads nothing for a presentation that does not exist", async () => {
    await expect(
      readPresentationEvaluation(administration, {
        presentationId: "00000000-0000-0000-0000-000000000000",
      }),
    ).resolves.toBeNull();
  });
});

describe("a presentation's evaluation, as its academy reads it", () => {
  async function seedScored() {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const audience = {
      academyId: fixture.academy.academy.id,
      kind: "academy",
    } as const;

    return { audience, fixture, presentation };
  }

  test("keeps only the judges who scored, with their sheet and their take", async () => {
    const { audience, fixture, presentation } = await seedScored();
    const technique = await fixture.addCriterion({
      maximum: 100,
      name: "Técnica",
    });
    const scored = await fixture.assignJudge(presentation.presentationId);
    await fixture.assignJudge(presentation.presentationId);
    const [score] = await db
      .insert(scores)
      .values({
        feedbackAudioStorageKey: "takes/a.webm",
        judgeAssignmentId: scored.judgeAssignmentId,
        value: "92.0",
      })
      .returning();
    await db
      .insert(scoreCriterionValues)
      .values({ criterionId: technique.id, scoreId: score.id, value: "92.0" });
    await publishResults(fixture.event.id);

    const view = await readPresentationEvaluation(
      audience,
      { choreographyId: presentation.choreographyId },
      { storage: signingStorage },
    );

    expect(view?.result).toEqual({
      average: 92,
      award: "gold",
      kind: "scored",
    });
    expect(view?.criteria).toMatchObject([{ name: "Técnica" }]);
    expect(view?.judges).toEqual([
      {
        criteriaValues: { [technique.id]: "92.0" },
        feedbackAudioUrl: "https://example.test/takes/a.webm",
        judgeId: scored.judgeId,
        judgeName: "Ana Juez",
        value: "92.0",
      },
    ]);
  });

  test("drops every number of a disqualified presentation and keeps each take", async () => {
    const { audience, fixture, presentation } = await seedScored();
    await fixture.addCriterion({ maximum: 100, name: "Técnica" });
    const judge = await fixture.assignJudge(presentation.presentationId);
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

    const view = await readPresentationEvaluation(
      audience,
      { choreographyId: presentation.choreographyId },
      { storage: signingStorage },
    );

    expect(view?.result).toEqual({ kind: "disqualified" });
    expect(view?.criteria).toEqual([]);
    expect(view?.judges).toEqual([
      {
        criteriaValues: {},
        feedbackAudioUrl: "https://example.test/takes/a.webm",
        judgeId: judge.judgeId,
        judgeName: "Ana Juez",
        value: null,
      },
    ]);
  });

  test("reads nothing outside a published snapshot", async () => {
    const { audience, fixture, presentation } = await seedScored();
    await fixture.scorePresentation(presentation.presentationId, "80.0");
    const target = { choreographyId: presentation.choreographyId };

    await expect(
      readPresentationEvaluation(audience, target),
    ).resolves.toBeNull();

    await publishResults(fixture.event.id);
    await expect(
      readPresentationEvaluation(audience, target),
    ).resolves.not.toBeNull();

    await hideResults(fixture.event.id);
    await expect(
      readPresentationEvaluation(audience, target),
    ).resolves.toBeNull();
  });

  test("reads nothing of another academy's published presentation", async () => {
    const { fixture, presentation } = await seedScored();
    await fixture.scorePresentation(presentation.presentationId, "80.0");
    await publishResults(fixture.event.id);
    const stranger = await seedJudgingFixture({ active: false });

    await expect(
      readPresentationEvaluation(
        { academyId: stranger.academy.academy.id, kind: "academy" },
        { choreographyId: presentation.choreographyId },
      ),
    ).resolves.toBeNull();
  });
});

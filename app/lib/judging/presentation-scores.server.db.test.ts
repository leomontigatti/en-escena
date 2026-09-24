import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { presentations, scoreCriterionValues, scores, user } from "@/db/schema";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { readPresentationScores } from "@/lib/judging/presentation-scores.server";
import { createFeedbackAudioStorage } from "@/lib/storage/feedback-audio.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const signingStorage = createFeedbackAudioStorage({
  createSignedUrl: async (input) => `https://example.test/${input.key}`,
  remove: async () => {},
  upload: async () => {},
});

describe("a presentation's scores, as administration reads them", () => {
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

    const view = await readPresentationScores({
      presentationId: presentation.presentationId,
      storage: signingStorage,
    });

    expect(view?.name).toBe("Primera");
    expect(view?.academyName).toBe(fixture.academy.academy.name);
    expect(view?.choreographyId).toBe(presentation.choreographyId);
    expect(view?.criteria).toEqual([]);
    expect(view?.judges).toMatchObject([
      { annulled: false, judgeName: "Ana Juez", value: null },
      {
        annulled: false,
        feedbackAudioUrl: "https://example.test/takes/a.webm",
        judgeName: "Zulema Juez",
        value: "90.0",
      },
    ]);
  });

  test("averages what counts and reads the medal off it", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const first = await fixture.assignJudge(presentation.presentationId);
    const second = await fixture.assignJudge(presentation.presentationId);
    const annulled = await fixture.assignJudge(presentation.presentationId);

    await db.insert(scores).values([
      { judgeAssignmentId: first.judgeAssignmentId, value: "80.0" },
      { judgeAssignmentId: second.judgeAssignmentId, value: "90.0" },
      {
        annulled: true,
        judgeAssignmentId: annulled.judgeAssignmentId,
        value: "10.0",
      },
    ]);

    const view = await readPresentationScores({
      presentationId: presentation.presentationId,
    });

    expect(view?.average).toBe(85);
    expect(view?.medal).toBe("plata");
    expect(view?.disqualified).toBe(false);
  });

  test("has no average and no medal once the presentation is disqualified", async () => {
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

    const view = await readPresentationScores({
      presentationId: presentation.presentationId,
    });

    expect(view).toMatchObject({
      average: null,
      disqualified: true,
      medal: null,
    });
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

    const view = await readPresentationScores({
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

  test("reads nothing for a presentation that does not exist", async () => {
    await expect(
      readPresentationScores({
        presentationId: "00000000-0000-0000-0000-000000000000",
      }),
    ).resolves.toBeNull();
  });
});

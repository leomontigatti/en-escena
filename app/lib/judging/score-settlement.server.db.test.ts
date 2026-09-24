import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { presentations, scoreCriterionValues, scores } from "@/db/schema";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

import {
  annulScore,
  editScore,
  setPresentationDisqualified,
} from "./score-settlement.server";
import { seedJudgingFixture } from "./judging.test-support";
import { readPresentationScores } from "./presentation-scores.server";

installDatabaseTestHooks();

async function seedScoredPresentation(input?: { submodalityId?: null }) {
  const fixture = await seedJudgingFixture();
  const presentation = await fixture.addPresentation({
    name: "Primera",
    orderNumber: 1,
    submodalityId: input?.submodalityId,
  });
  const judge = await fixture.assignJudge(presentation.presentationId);
  const [score] = await db
    .insert(scores)
    .values({ judgeAssignmentId: judge.judgeAssignmentId, value: "70.0" })
    .returning();

  return { fixture, judge, presentation, score };
}

async function readScore(scoreId: string) {
  const [row] = await db.select().from(scores).where(eq(scores.id, scoreId));

  return row;
}

describe("editing a score as administration", () => {
  test("stores a new single value with no reason asked", async () => {
    const { presentation, score } = await seedScoredPresentation({
      submodalityId: null,
    });

    const result = await editScore({
      presentationId: presentation.presentationId,
      scoreId: score.id,
      value: "88.5",
    });

    expect(result).toEqual({ ok: true });
    expect((await readScore(score.id)).value).toBe("88.5");
  });

  test("refuses a value the judge's own save would refuse", async () => {
    const { presentation, score } = await seedScoredPresentation({
      submodalityId: null,
    });

    const result = await editScore({
      presentationId: presentation.presentationId,
      scoreId: score.id,
      value: "88.3",
    });

    expect(result).toEqual({ ok: false, reason: "invalid-value" });
    expect((await readScore(score.id)).value).toBe("70.0");
  });

  test("recomputes the score's value from an edited sheet", async () => {
    const { fixture, presentation, score } = await seedScoredPresentation();
    const technique = await fixture.addCriterion({
      maximum: 100,
      name: "Técnica",
    });
    const penalty = await fixture.addCriterion({
      kind: "deducts",
      maximum: 10,
      name: "Penalización",
      position: 1,
    });

    const result = await editScore({
      criteriaValues: { [technique.id]: "90", [penalty.id]: "5.5" },
      presentationId: presentation.presentationId,
      scoreId: score.id,
    });

    expect(result).toEqual({ ok: true });
    expect((await readScore(score.id)).value).toBe("84.5");
    expect(
      await db
        .select()
        .from(scoreCriterionValues)
        .where(eq(scoreCriterionValues.scoreId, score.id)),
    ).toHaveLength(2);
  });

  test("returns a field error per criterion the sheet cannot save", async () => {
    const { fixture, presentation, score } = await seedScoredPresentation();
    const technique = await fixture.addCriterion({
      maximum: 100,
      name: "Técnica",
    });

    const result = await editScore({
      criteriaValues: { [technique.id]: "101" },
      presentationId: presentation.presentationId,
      scoreId: score.id,
    });

    expect(result).toMatchObject({
      fieldErrors: { [technique.id]: expect.stringContaining("0 a 100") },
      ok: false,
      reason: "invalid-sheet",
    });
  });

  test("refuses a score that does not exist, so no judge is given one", async () => {
    await expect(
      editScore({
        presentationId: "00000000-0000-0000-0000-000000000000",
        scoreId: "00000000-0000-0000-0000-000000000000",
        value: "90",
      }),
    ).resolves.toEqual({ ok: false, reason: "not-found" });
  });
});

describe("annulling a score as administration", () => {
  test("takes the score out of the average without deleting it", async () => {
    const { fixture, presentation, score } = await seedScoredPresentation({
      submodalityId: null,
    });
    const other = await fixture.assignJudge(presentation.presentationId);

    await db
      .insert(scores)
      .values({ judgeAssignmentId: other.judgeAssignmentId, value: "90.0" });

    expect(
      await annulScore({
        annulled: true,
        presentationId: presentation.presentationId,
        scoreId: score.id,
      }),
    ).toEqual({
      ok: true,
    });
    expect((await readScore(score.id)).value).toBe("70.0");
    await expect(
      readPresentationScores({ presentationId: presentation.presentationId }),
    ).resolves.toMatchObject({ average: 90 });
  });

  test("brings a restored score back into the average", async () => {
    const { presentation, score } = await seedScoredPresentation({
      submodalityId: null,
    });

    await annulScore({
      annulled: true,
      presentationId: presentation.presentationId,
      scoreId: score.id,
    });
    await annulScore({
      annulled: false,
      presentationId: presentation.presentationId,
      scoreId: score.id,
    });

    await expect(
      readPresentationScores({ presentationId: presentation.presentationId }),
    ).resolves.toMatchObject({ average: 70 });
  });

  test("refuses a score that does not exist", async () => {
    await expect(
      annulScore({
        annulled: true,
        presentationId: "00000000-0000-0000-0000-000000000000",
        scoreId: "00000000-0000-0000-0000-000000000000",
      }),
    ).resolves.toEqual({ ok: false, reason: "not-found" });
  });
});

describe("settling a disqualification as administration", () => {
  test("disqualifies after the judges' day has closed", async () => {
    const { presentation } = await seedScoredPresentation({
      submodalityId: null,
    });

    const result = await setPresentationDisqualified({
      disqualified: true,
      presentationId: presentation.presentationId,
    });

    expect(result).toEqual({ ok: true });

    const [row] = await db
      .select({ disqualifiedAt: presentations.disqualifiedAt })
      .from(presentations)
      .where(eq(presentations.id, presentation.presentationId));

    expect(row.disqualifiedAt).not.toBeNull();
  });

  test("reinstates the presentation with the scores saved before", async () => {
    const { presentation, score } = await seedScoredPresentation({
      submodalityId: null,
    });

    await setPresentationDisqualified({
      disqualified: true,
      presentationId: presentation.presentationId,
    });
    await setPresentationDisqualified({
      disqualified: false,
      presentationId: presentation.presentationId,
    });

    expect((await readScore(score.id)).value).toBe("70.0");
    await expect(
      readPresentationScores({ presentationId: presentation.presentationId }),
    ).resolves.toMatchObject({ average: 70, disqualified: false });
  });

  test("refuses a presentation that does not exist", async () => {
    await expect(
      setPresentationDisqualified({
        disqualified: true,
        presentationId: "00000000-0000-0000-0000-000000000000",
      }),
    ).resolves.toEqual({ ok: false, reason: "not-found" });
  });
});

import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  presentations,
  scoreCriterionValues,
  scores,
  submodalities,
  submodalityCriteria,
} from "@/db/schema";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";

import { installDatabaseTestHooks } from "../../tests/db/harness";

installDatabaseTestHooks();

describe("the score table", () => {
  test("keeps one score per judge assignment", async () => {
    const fixture = await seedJudgingFixture();
    const { presentationId } = await fixture.addPresentation({
      name: "Una",
      orderNumber: 1,
    });
    const { judgeAssignmentId } = await fixture.assignJudge(presentationId);

    await db.insert(scores).values({ judgeAssignmentId, value: "90.5" });

    await expect(
      db.insert(scores).values({ judgeAssignmentId, value: "80" }),
    ).rejects.toThrow();
  });

  test("takes a null value, for a `Devolución` with no number behind it", async () => {
    const fixture = await seedJudgingFixture();
    const { presentationId } = await fixture.addPresentation({
      name: "Una",
      orderNumber: 1,
    });
    const { judgeAssignmentId } = await fixture.assignJudge(presentationId);

    const [saved] = await db
      .insert(scores)
      .values({
        feedbackAudioStorageKey: "feedback/una.webm",
        judgeAssignmentId,
        value: null,
      })
      .returning();

    expect(saved.value).toBeNull();
    expect(saved.annulled).toBe(false);
  });

  test.each([
    { label: "above 100", value: "100.5" },
    { label: "below 0", value: "-0.5" },
    { label: "not a multiple of 0.5", value: "90.1" },
  ])("refuses a value $label", async ({ value }) => {
    const fixture = await seedJudgingFixture();
    const { presentationId } = await fixture.addPresentation({
      name: "Una",
      orderNumber: 1,
    });
    const { judgeAssignmentId } = await fixture.assignJudge(presentationId);

    await expect(
      db.insert(scores).values({ judgeAssignmentId, value }),
    ).rejects.toThrow();
  });
});

describe("the submodality criterion table", () => {
  test("refuses a maximum below 1", async () => {
    const fixture = await seedJudgingFixture();

    await expect(
      fixture.addCriterion({ maximum: 0, name: "Técnica" }),
    ).rejects.toThrow();
  });

  test("refuses a second criterion whose name differs only in case", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addCriterion({ maximum: 60, name: "Técnica" });

    await expect(
      fixture.addCriterion({ maximum: 40, name: "técnica" }),
    ).rejects.toThrow();
  });

  test("goes with the submodality it describes", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addCriterion({ maximum: 100, name: "Técnica" });

    await db
      .delete(submodalities)
      .where(eq(submodalities.id, fixture.catalog.submodality.id));

    expect(await db.select().from(submodalityCriteria)).toEqual([]);
  });
});

describe("the score criterion value table", () => {
  async function seedSheet() {
    const fixture = await seedJudgingFixture();
    const { presentationId } = await fixture.addPresentation({
      name: "Una",
      orderNumber: 1,
    });
    const { judgeAssignmentId } = await fixture.assignJudge(presentationId);
    const criterion = await fixture.addCriterion({
      maximum: 20,
      name: "Técnica",
    });
    const [score] = await db
      .insert(scores)
      .values({ judgeAssignmentId, value: "20" })
      .returning();

    return { criterion, score };
  }

  test.each([
    { label: "above the criterion's maximum", value: "20.5" },
    { label: "below 0", value: "-0.5" },
    { label: "not a multiple of 0.5", value: "10.1" },
  ])("refuses a value $label", async ({ value }) => {
    const { criterion, score } = await seedSheet();

    await expect(
      db.insert(scoreCriterionValues).values({
        criterionId: criterion.id,
        scoreId: score.id,
        value,
      }),
    ).rejects.toThrow();
  });

  test("takes a value up to the criterion's maximum", async () => {
    const { criterion, score } = await seedSheet();

    await db.insert(scoreCriterionValues).values({
      criterionId: criterion.id,
      scoreId: score.id,
      value: "20",
    });

    expect(await db.select().from(scoreCriterionValues)).toHaveLength(1);
  });

  test("goes with the score it belongs to", async () => {
    const { criterion, score } = await seedSheet();
    await db.insert(scoreCriterionValues).values({
      criterionId: criterion.id,
      scoreId: score.id,
      value: "15",
    });

    await db.delete(scores).where(eq(scores.id, score.id));

    expect(await db.select().from(scoreCriterionValues)).toEqual([]);
  });

  test("holds a criterion that has been scored in place", async () => {
    const { criterion, score } = await seedSheet();
    await db.insert(scoreCriterionValues).values({
      criterionId: criterion.id,
      scoreId: score.id,
      value: "15",
    });

    await expect(
      db
        .delete(submodalityCriteria)
        .where(eq(submodalityCriteria.id, criterion.id)),
    ).rejects.toThrow();
  });
});

describe("the presentation table", () => {
  test("starts with no disqualification and takes one", async () => {
    const fixture = await seedJudgingFixture();
    const { presentationId } = await fixture.addPresentation({
      name: "Una",
      orderNumber: 1,
    });

    const [before] = await db
      .select()
      .from(presentations)
      .where(eq(presentations.id, presentationId));
    expect(before.disqualifiedAt).toBeNull();

    const disqualifiedAt = new Date("2026-10-10T23:00:00Z");
    await db
      .update(presentations)
      .set({ disqualifiedAt })
      .where(eq(presentations.id, presentationId));

    const [after] = await db
      .select()
      .from(presentations)
      .where(eq(presentations.id, presentationId));
    expect(after.disqualifiedAt).toEqual(disqualifiedAt);
  });
});

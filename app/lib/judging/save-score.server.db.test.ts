import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { schedules, scores } from "@/db/schema";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

import { seedJudgingFixture } from "./judging.test-support";
import { judgingDate } from "./judging-day";
import { saveJudgeScore } from "./save-score.server";

installDatabaseTestHooks();

async function seedOpenPresentation() {
  const fixture = await seedJudgingFixture();
  const presentation = await fixture.addPresentation({
    name: "Primera",
    orderNumber: 1,
  });
  const judge = await fixture.assignJudge(presentation.presentationId);

  await db
    .update(schedules)
    .set({ scheduledDate: judgingDate() })
    .where(eq(schedules.id, fixture.catalog.schedule.id));

  return { fixture, judge, presentation };
}

async function readScores(judgeAssignmentId: string) {
  return db
    .select()
    .from(scores)
    .where(eq(scores.judgeAssignmentId, judgeAssignmentId));
}

describe("saving a judge's score", () => {
  test("creates the score row on the judge's first save", async () => {
    const { judge, presentation } = await seedOpenPresentation();

    const result = await saveJudgeScore({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
      value: "90.5",
    });

    expect(result).toEqual({ ok: true });
    expect(await readScores(judge.judgeAssignmentId)).toMatchObject([
      { annulled: false, value: "90.5" },
    ]);
  });

  test("upserts on the judge assignment when the judge saves again", async () => {
    const { judge, presentation } = await seedOpenPresentation();
    const save = (value: string) =>
      saveJudgeScore({
        judgeId: judge.judgeId,
        presentationId: presentation.presentationId,
        value,
      });

    await save("90.5");
    await save("72");

    expect(await readScores(judge.judgeAssignmentId)).toMatchObject([
      { value: "72.0" },
    ]);
  });

  test("refuses a judge who is not assigned to the presentation", async () => {
    const { fixture, presentation } = await seedOpenPresentation();
    const other = await fixture.addPresentation({
      name: "Segunda",
      orderNumber: 2,
    });
    const stranger = await fixture.assignJudge(other.presentationId);

    const result = await saveJudgeScore({
      judgeId: stranger.judgeId,
      presentationId: presentation.presentationId,
      value: "80",
    });

    expect(result).toEqual({ ok: false, reason: "not-assigned" });
    expect(await readScores(stranger.judgeAssignmentId)).toEqual([]);
  });

  test("refuses a write once the judging day has closed", async () => {
    const { fixture, judge, presentation } = await seedOpenPresentation();

    await db
      .update(schedules)
      .set({ scheduledDate: "2020-01-01" })
      .where(eq(schedules.id, fixture.catalog.schedule.id));

    const result = await saveJudgeScore({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
      value: "80",
    });

    expect(result).toEqual({ ok: false, reason: "closed" });
    expect(await readScores(judge.judgeAssignmentId)).toEqual([]);
  });

  test("refuses a value that is not a half step from 0 to 100", async () => {
    const { judge, presentation } = await seedOpenPresentation();

    const result = await saveJudgeScore({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
      value: "101",
    });

    expect(result).toEqual({ ok: false, reason: "invalid-value" });
    expect(await readScores(judge.judgeAssignmentId)).toEqual([]);
  });
});

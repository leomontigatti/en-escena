import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { presentations, schedules, scores } from "@/db/schema";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

import {
  disqualifyPresentation,
  reinstatePresentation,
} from "./disqualification.server";
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

async function readDisqualifiedAt(presentationId: string) {
  const [row] = await db
    .select({ disqualifiedAt: presentations.disqualifiedAt })
    .from(presentations)
    .where(eq(presentations.id, presentationId));

  return row.disqualifiedAt;
}

describe("disqualifying a presentation from the judge's form", () => {
  test("stamps the presentation so the whole panel sees it closed", async () => {
    const { judge, presentation } = await seedOpenPresentation();

    const result = await disqualifyPresentation({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
    });

    expect(result).toEqual({ ok: true });
    expect(
      await readDisqualifiedAt(presentation.presentationId),
    ).not.toBeNull();
  });

  test("refuses a judge who is not assigned to the presentation", async () => {
    const { fixture, presentation } = await seedOpenPresentation();
    const other = await fixture.addPresentation({
      name: "Otra",
      orderNumber: 2,
    });
    const stranger = await fixture.assignJudge(other.presentationId);

    const result = await disqualifyPresentation({
      judgeId: stranger.judgeId,
      presentationId: presentation.presentationId,
    });

    expect(result).toEqual({ ok: false, reason: "not-assigned" });
    expect(await readDisqualifiedAt(presentation.presentationId)).toBeNull();
  });

  test("refuses a presentation whose judging day has closed", async () => {
    const { fixture, judge, presentation } = await seedOpenPresentation();

    await db
      .update(schedules)
      .set({ scheduledDate: "2020-01-01" })
      .where(eq(schedules.id, fixture.catalog.schedule.id));

    const result = await disqualifyPresentation({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
    });

    expect(result).toEqual({ ok: false, reason: "closed" });
    expect(await readDisqualifiedAt(presentation.presentationId)).toBeNull();
  });
});

describe("reinstating a disqualified presentation", () => {
  test("clears the stamp and leaves the scores saved before untouched", async () => {
    const { judge, presentation } = await seedOpenPresentation();

    await saveJudgeScore({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
      value: "80",
    });
    await disqualifyPresentation({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
    });
    const result = await reinstatePresentation({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
    });

    expect(result).toEqual({ ok: true });
    expect(await readDisqualifiedAt(presentation.presentationId)).toBeNull();
    expect(
      await db
        .select({ value: scores.value })
        .from(scores)
        .where(eq(scores.judgeAssignmentId, judge.judgeAssignmentId)),
    ).toEqual([{ value: "80.0" }]);
  });

  test("refuses a judge who is not assigned to the presentation", async () => {
    const { fixture, judge, presentation } = await seedOpenPresentation();
    const other = await fixture.addPresentation({
      name: "Otra",
      orderNumber: 2,
    });
    const stranger = await fixture.assignJudge(other.presentationId);

    await disqualifyPresentation({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
    });

    const result = await reinstatePresentation({
      judgeId: stranger.judgeId,
      presentationId: presentation.presentationId,
    });

    expect(result).toEqual({ ok: false, reason: "not-assigned" });
    expect(
      await readDisqualifiedAt(presentation.presentationId),
    ).not.toBeNull();
  });

  test("refuses a presentation whose judging day has closed", async () => {
    const { fixture, judge, presentation } = await seedOpenPresentation();

    await disqualifyPresentation({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
    });
    await db
      .update(schedules)
      .set({ scheduledDate: "2020-01-01" })
      .where(eq(schedules.id, fixture.catalog.schedule.id));

    const result = await reinstatePresentation({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
    });

    expect(result).toEqual({ ok: false, reason: "closed" });
    expect(
      await readDisqualifiedAt(presentation.presentationId),
    ).not.toBeNull();
  });
});

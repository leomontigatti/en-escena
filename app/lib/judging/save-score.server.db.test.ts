import { asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { schedules, scoreCriterionValues, scores } from "@/db/schema";
import {
  type FeedbackAudioStorageAdapter,
  createFeedbackAudioStorage,
} from "@/lib/storage/feedback-audio.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

import { disqualifyPresentation } from "./disqualification.server";
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

/**
 * The storage adapter is faked exactly as the music tests fake it: what these
 * tests are about is which key the score ends up pointing at and when the
 * previous object is removed, neither of which needs a real volume.
 */
function createAudioStorage(
  overrides: Partial<FeedbackAudioStorageAdapter> = {},
) {
  const uploaded: string[] = [];
  const removed: string[] = [];
  let taken = 0;
  const storage = createFeedbackAudioStorage(
    {
      createSignedUrl: async () => "https://example.test/signed",
      remove: async (input) => {
        removed.push(...input.keys);
      },
      upload: async (input) => {
        uploaded.push(input.key);
      },
      ...overrides,
    },
    { uniqueSuffix: () => `take-${(taken += 1)}` },
  );

  return { removed, storage, uploaded };
}

function webmTake() {
  return new Blob(["audio"], { type: "audio/webm" });
}

describe("saving a judge's `Devolución`", () => {
  test("stores the take and points the score at its key", async () => {
    const { judge, presentation } = await seedOpenPresentation();
    const audio = createAudioStorage();

    const result = await saveJudgeScore({
      audio: { file: webmTake(), intent: "replace" },
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
      storage: audio.storage,
      value: "80",
    });

    expect(result).toEqual({ ok: true });
    expect(audio.uploaded).toHaveLength(1);
    expect(await readScores(judge.judgeAssignmentId)).toMatchObject([
      { feedbackAudioStorageKey: audio.uploaded[0], value: "80.0" },
    ]);
    expect(audio.removed).toEqual([]);
  });

  test("keeps the stored take when the judge only corrects the score", async () => {
    const { judge, presentation } = await seedOpenPresentation();
    const audio = createAudioStorage();
    const save = (input: Parameters<typeof saveJudgeScore>[0]["audio"]) =>
      saveJudgeScore({
        audio: input,
        judgeId: judge.judgeId,
        presentationId: presentation.presentationId,
        storage: audio.storage,
        value: "80",
      });

    await save({ file: webmTake(), intent: "replace" });
    await save({ intent: "keep" });

    expect(await readScores(judge.judgeAssignmentId)).toMatchObject([
      { feedbackAudioStorageKey: audio.uploaded[0] },
    ]);
    expect(audio.removed).toEqual([]);
  });

  test("removes the previous object once a replacement is committed", async () => {
    const { judge, presentation } = await seedOpenPresentation();
    const audio = createAudioStorage();
    const save = () =>
      saveJudgeScore({
        audio: { file: webmTake(), intent: "replace" },
        judgeId: judge.judgeId,
        presentationId: presentation.presentationId,
        storage: audio.storage,
        value: "80",
      });

    await save();
    await save();

    expect(audio.uploaded).toHaveLength(2);
    expect(audio.removed).toEqual([audio.uploaded[0]]);
    expect(await readScores(judge.judgeAssignmentId)).toMatchObject([
      { feedbackAudioStorageKey: audio.uploaded[1] },
    ]);
  });

  test("clears the key and removes the object when the judge deletes the take", async () => {
    const { judge, presentation } = await seedOpenPresentation();
    const audio = createAudioStorage();

    await saveJudgeScore({
      audio: { file: webmTake(), intent: "replace" },
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
      storage: audio.storage,
      value: "80",
    });
    await saveJudgeScore({
      audio: { intent: "remove" },
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
      storage: audio.storage,
      value: "80",
    });

    expect(audio.removed).toEqual([audio.uploaded[0]]);
    expect(await readScores(judge.judgeAssignmentId)).toMatchObject([
      { feedbackAudioStorageKey: null },
    ]);
  });

  // A score pointing at an object that was never written is the one state the
  // judge cannot see and cannot fix, so the save fails loudly instead.
  test("fails the whole save when the upload does, keeping the stored score", async () => {
    const { judge, presentation } = await seedOpenPresentation();
    const audio = createAudioStorage();

    await saveJudgeScore({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
      value: "80",
    });

    const failing = createAudioStorage({
      upload: async () => {
        throw new Error("volume unwritable");
      },
    });

    await expect(
      saveJudgeScore({
        audio: { file: webmTake(), intent: "replace" },
        judgeId: judge.judgeId,
        presentationId: presentation.presentationId,
        storage: failing.storage,
        value: "95",
      }),
    ).rejects.toThrow();

    expect(await readScores(judge.judgeAssignmentId)).toMatchObject([
      { feedbackAudioStorageKey: null, value: "80.0" },
    ]);
    expect(audio.removed).toEqual([]);
  });

  test("refuses a take the feedback audio policy does not accept", async () => {
    const { judge, presentation } = await seedOpenPresentation();
    const audio = createAudioStorage();

    const result = await saveJudgeScore({
      audio: {
        file: new Blob(["audio"], { type: "audio/mpeg" }),
        intent: "replace",
      },
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
      storage: audio.storage,
      value: "80",
    });

    expect(result).toEqual({
      ok: false,
      reason: "invalid-audio",
      rejection: {
        contentType: "audio/mpeg",
        kind: "feedbackAudio",
        reason: "unsupported-content-type",
      },
    });
    expect(audio.uploaded).toEqual([]);
    expect(await readScores(judge.judgeAssignmentId)).toEqual([]);
  });
});

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

async function readCriterionValues(judgeAssignmentId: string) {
  return db
    .select({
      criterionId: scoreCriterionValues.criterionId,
      value: scoreCriterionValues.value,
    })
    .from(scoreCriterionValues)
    .innerJoin(scores, eq(scores.id, scoreCriterionValues.scoreId))
    .where(eq(scores.judgeAssignmentId, judgeAssignmentId))
    .orderBy(asc(scoreCriterionValues.value));
}

describe("saving a judge's sheet of criteria", () => {
  async function seedSheet() {
    const open = await seedOpenPresentation();
    const tecnica = await open.fixture.addCriterion({
      maximum: 60,
      name: "Técnica",
      position: 0,
    });
    const interpretacion = await open.fixture.addCriterion({
      maximum: 40,
      name: "Interpretación",
      position: 1,
    });
    const penalizacion = await open.fixture.addCriterion({
      kind: "deducts",
      maximum: 20,
      name: "Penalización",
      position: 2,
    });

    return { ...open, interpretacion, penalizacion, tecnica };
  }

  test("stores every criterion value and recomputes the score from the total", async () => {
    const sheet = await seedSheet();

    const result = await saveJudgeScore({
      criteriaValues: {
        [sheet.interpretacion.id]: "30",
        [sheet.penalizacion.id]: "2.5",
        [sheet.tecnica.id]: "50",
      },
      judgeId: sheet.judge.judgeId,
      presentationId: sheet.presentation.presentationId,
    });

    expect(result).toEqual({ ok: true });
    expect(await readScores(sheet.judge.judgeAssignmentId)).toMatchObject([
      { value: "77.5" },
    ]);
    expect(await readCriterionValues(sheet.judge.judgeAssignmentId)).toEqual([
      { criterionId: sheet.penalizacion.id, value: "2.5" },
      { criterionId: sheet.interpretacion.id, value: "30.0" },
      { criterionId: sheet.tecnica.id, value: "50.0" },
    ]);
  });

  test("replaces the stored sheet when the judge corrects it", async () => {
    const sheet = await seedSheet();
    const save = (tecnica: string) =>
      saveJudgeScore({
        criteriaValues: {
          [sheet.interpretacion.id]: "30",
          [sheet.penalizacion.id]: "0",
          [sheet.tecnica.id]: tecnica,
        },
        judgeId: sheet.judge.judgeId,
        presentationId: sheet.presentation.presentationId,
      });

    await save("50");
    await save("60");

    expect(await readScores(sheet.judge.judgeAssignmentId)).toMatchObject([
      { value: "90.0" },
    ]);
    expect(await readCriterionValues(sheet.judge.judgeAssignmentId)).toEqual([
      { criterionId: sheet.penalizacion.id, value: "0.0" },
      { criterionId: sheet.interpretacion.id, value: "30.0" },
      { criterionId: sheet.tecnica.id, value: "60.0" },
    ]);
  });

  test("refuses the sheet when a criterion of the submodality is missing or out of range", async () => {
    const sheet = await seedSheet();

    const result = await saveJudgeScore({
      criteriaValues: {
        [sheet.penalizacion.id]: "30",
        [sheet.tecnica.id]: "50",
      },
      judgeId: sheet.judge.judgeId,
      presentationId: sheet.presentation.presentationId,
    });

    expect(result).toEqual({
      fieldErrors: {
        [sheet.interpretacion.id]: "Ingresá un valor de 0 a 40, de 0.5 en 0.5.",
        [sheet.penalizacion.id]: "Ingresá un valor de 0 a 20, de 0.5 en 0.5.",
      },
      ok: false,
      reason: "invalid-sheet",
    });
    expect(await readScores(sheet.judge.judgeAssignmentId)).toEqual([]);
  });
});

describe("saving on a presentation a colleague disqualified", () => {
  test("stores the take, leaves the score alone and says so", async () => {
    const { judge, presentation } = await seedOpenPresentation();
    const audio = createAudioStorage();

    await saveJudgeScore({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
      value: "80",
    });
    await disqualifyPresentation({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
    });

    const result = await saveJudgeScore({
      audio: { file: webmTake(), intent: "replace" },
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
      storage: audio.storage,
      value: "20",
    });

    expect(result).toEqual({ disqualified: true, ok: true });
    expect(await readScores(judge.judgeAssignmentId)).toMatchObject([
      { feedbackAudioStorageKey: audio.uploaded[0], value: "80.0" },
    ]);
  });

  test("leaves a `Devolución` with no score for a judge who had not scored yet", async () => {
    const { judge, presentation } = await seedOpenPresentation();
    const audio = createAudioStorage();

    await disqualifyPresentation({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
    });

    const result = await saveJudgeScore({
      audio: { file: webmTake(), intent: "replace" },
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
      storage: audio.storage,
      value: "no es un puntaje",
    });

    expect(result).toEqual({ disqualified: true, ok: true });
    expect(await readScores(judge.judgeAssignmentId)).toMatchObject([
      { feedbackAudioStorageKey: audio.uploaded[0], value: null },
    ]);
  });

  test("writes no score at all for a judge who saves neither a value nor a take", async () => {
    const { judge, presentation } = await seedOpenPresentation();

    await disqualifyPresentation({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
    });

    const result = await saveJudgeScore({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
      value: "80",
    });

    expect(result).toEqual({ disqualified: true, ok: true });
    expect(await readScores(judge.judgeAssignmentId)).toEqual([]);
  });

  test("keeps a stored take a judge saves over without touching the recorder", async () => {
    const { judge, presentation } = await seedOpenPresentation();
    const audio = createAudioStorage();

    await disqualifyPresentation({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
    });
    await saveJudgeScore({
      audio: { file: webmTake(), intent: "replace" },
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
      storage: audio.storage,
    });

    const result = await saveJudgeScore({
      judgeId: judge.judgeId,
      presentationId: presentation.presentationId,
      storage: audio.storage,
    });

    expect(result).toEqual({ disqualified: true, ok: true });
    expect(await readScores(judge.judgeAssignmentId)).toMatchObject([
      { feedbackAudioStorageKey: audio.uploaded[0], value: null },
    ]);
    expect(audio.removed).toEqual([]);
  });
});

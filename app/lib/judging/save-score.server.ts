import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  judgeAssignments,
  presentations,
  schedules,
  scoreCriterionValues,
  scores,
  submodalityCriteria,
} from "@/db/schema";
import { isOpenForJudges } from "@/lib/judging/judging-day";
import {
  formatScoreValue,
  parseScoreValue,
  singleScoreMaximum,
} from "@/lib/judging/score-value";
import { validateSheetValues } from "@/lib/judging/sheet-total";
import type { UploadRejection } from "@/lib/storage/asset-kinds";
import {
  type FeedbackAudioStorage,
  createDefaultFeedbackAudioStorage,
} from "@/lib/storage/feedback-audio.server";

/**
 * A judge's own save of a single 0-100 score. See docs/domain/judging.md,
 * "Scores And Feedback".
 *
 * Everything the save is allowed to depend on is read inside the transaction,
 * under a `FOR UPDATE` on the presentation: a judge mid-dialog while the panel
 * moves around them must not have their write decided by what the page was
 * rendered with. The write itself is an upsert on the assignment, so the row a
 * retry finds is the row it updates and a doubled tap never yields two scores.
 *
 * The `Devolución` rides along with the score rather than having a save of its
 * own, so the judge's one "Guardar" means one thing. The take is uploaded
 * inside the transaction, before the score is written, and the object it
 * replaces is deleted only after the commit: a failed upload takes the whole
 * save down rather than leaving a score pointing at nothing, and a rolled-back
 * save never costs the judge audio that was already stored.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SaveJudgeScoreRefusal = "not-assigned" | "closed" | "invalid-value";

export type SaveJudgeScoreResult =
  | { ok: true }
  | { ok: false; reason: SaveJudgeScoreRefusal }
  | { fieldErrors: Record<string, string>; ok: false; reason: "invalid-sheet" }
  | { ok: false; reason: "invalid-audio"; rejection: UploadRejection };

/**
 * What the form says to do with the stored take. `keep` is what a save that
 * never touched the recorder submits, and is the default so a caller that knows
 * nothing about audio cannot silently drop one.
 */
export type FeedbackAudioSubmission =
  { file: Blob; intent: "replace" } | { intent: "keep" } | { intent: "remove" };

export type SaveJudgeScoreInput = {
  audio?: FeedbackAudioSubmission;
  /** What the sheet posted, by criterion; read only when the submodality has criteria. */
  criteriaValues?: Record<string, string>;
  judgeId: string;
  now?: Date;
  presentationId: string;
  storage?: FeedbackAudioStorage;
  /** The single 0-100 score; ignored by a submodality judged on a sheet. */
  value?: string;
};

export async function saveJudgeScore(
  input: SaveJudgeScoreInput,
): Promise<SaveJudgeScoreResult> {
  const audio = input.audio ?? { intent: "keep" };
  const committed = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ eventId: presentations.eventId, id: presentations.id })
      .from(presentations)
      .where(eq(presentations.id, input.presentationId))
      .for("update");

    if (!locked) {
      return { result: { ok: false, reason: "not-assigned" } as const };
    }

    const [assignment] = await tx
      .select({
        feedbackAudioStorageKey: scores.feedbackAudioStorageKey,
        id: judgeAssignments.id,
      })
      .from(judgeAssignments)
      .leftJoin(scores, eq(scores.judgeAssignmentId, judgeAssignments.id))
      .where(
        and(
          eq(judgeAssignments.presentationId, input.presentationId),
          eq(judgeAssignments.userId, input.judgeId),
        ),
      );

    if (!assignment) {
      return { result: { ok: false, reason: "not-assigned" } as const };
    }

    if (!(await isPresentationOpenForJudges(tx, input))) {
      return { result: { ok: false, reason: "closed" } as const };
    }

    const sheet = await readSheet(tx, input);

    if (!sheet.ok) {
      return { result: sheet.result };
    }

    const storedKey = assignment.feedbackAudioStorageKey;
    const nextKey = await resolveFeedbackAudioKey({
      audio,
      eventId: locked.eventId,
      judgeId: input.judgeId,
      presentationId: input.presentationId,
      storage: input.storage,
      storedKey,
    });

    if (!nextKey.ok) {
      return {
        result: {
          ok: false,
          reason: "invalid-audio",
          rejection: nextKey.rejection,
        } as const,
      };
    }

    const row = {
      feedbackAudioStorageKey: nextKey.storageKey,
      value: formatScoreValue(sheet.total),
    };

    const [saved] = await tx
      .insert(scores)
      .values({ ...row, judgeAssignmentId: assignment.id })
      .onConflictDoUpdate({
        target: scores.judgeAssignmentId,
        set: { ...row, updatedAt: new Date() },
      })
      .returning({ id: scores.id });

    await writeSheetValues(tx, saved.id, sheet.values);

    return {
      previousKey:
        storedKey && storedKey !== nextKey.storageKey ? storedKey : null,
      result: { ok: true } as const,
    };
  });

  if ("previousKey" in committed && committed.previousKey) {
    await removeReplacedFeedbackAudio({
      storage: input.storage,
      storageKey: committed.previousKey,
    });
  }

  return committed.result;
}

type FeedbackAudioKeyResolution =
  | { ok: false; rejection: UploadRejection }
  | { ok: true; storageKey: string | null };

/**
 * Where the score's key comes from, given what the form asked for. The upload
 * runs here, inside the transaction, so anything it throws rolls the score back
 * with it; only a policy rejection — which the judge can act on — comes back as
 * a value.
 */
async function resolveFeedbackAudioKey(input: {
  audio: FeedbackAudioSubmission;
  eventId: string;
  judgeId: string;
  presentationId: string;
  storage?: FeedbackAudioStorage;
  storedKey: string | null;
}): Promise<FeedbackAudioKeyResolution> {
  if (input.audio.intent === "keep") {
    return { ok: true, storageKey: input.storedKey };
  }

  if (input.audio.intent === "remove") {
    return { ok: true, storageKey: null };
  }

  const uploaded = await feedbackAudioStorage(
    input.storage,
  ).uploadFeedbackAudio({
    eventId: input.eventId,
    file: input.audio.file,
    judgeId: input.judgeId,
    presentationId: input.presentationId,
  });

  return uploaded.ok
    ? { ok: true, storageKey: uploaded.storageKey }
    : { ok: false, rejection: uploaded.rejection };
}

/**
 * The score already points elsewhere by the time this runs, so a failure here
 * cannot undo the save: propagating it would tell the judge their score was
 * lost when it was not. The cost is an object left on the volume, and this line
 * is the only thing that makes it locatable without walking the volume by hand
 * — the same trade the choreography music replacement makes.
 */
async function removeReplacedFeedbackAudio(input: {
  storage?: FeedbackAudioStorage;
  storageKey: string;
}) {
  try {
    await feedbackAudioStorage(input.storage).removeFeedbackAudio(
      input.storageKey,
    );
  } catch (thrown) {
    console.error("[storage:feedback-audio:orphan]", {
      detail: thrown instanceof Error ? thrown.message : String(thrown),
      storageKey: input.storageKey,
    });
  }
}

/** Built on demand: a save with no audio must not need the storage env at all. */
function feedbackAudioStorage(storage?: FeedbackAudioStorage) {
  return storage ?? createDefaultFeedbackAudioStorage();
}

/**
 * A presentation whose choreography has no schedule yet has no day to be open
 * on, so it is closed: the judges are given the program before they are given
 * anything to score.
 */
async function isPresentationOpenForJudges(
  tx: Transaction,
  input: Pick<SaveJudgeScoreInput, "now" | "presentationId">,
): Promise<boolean> {
  const [row] = await tx
    .select({ scheduledDate: schedules.scheduledDate })
    .from(presentations)
    .innerJoin(
      choreographies,
      eq(choreographies.id, presentations.choreographyId),
    )
    .innerJoin(schedules, eq(schedules.id, choreographies.scheduleId))
    .where(eq(presentations.id, input.presentationId));

  return Boolean(row) && isOpenForJudges(row.scheduledDate, input.now);
}

type SheetResolution =
  | { ok: false; result: SaveJudgeScoreResult }
  | {
      ok: true;
      total: number;
      values: { criterionId: string; value: number }[] | null;
    };

/**
 * What the save is actually storing: the sheet of the submodality as it stands
 * in the database, or the single value the judge typed when there is no sheet.
 * The criteria are read here, inside the transaction, rather than trusted from
 * what the form rendered — a criterion added since the page loaded is a line the
 * judge has to fill, and one removed is a value that must not be stored.
 *
 * `values` is null when there is no sheet, which is what tells the write to
 * leave the criterion values alone.
 */
async function readSheet(
  tx: Transaction,
  input: Pick<
    SaveJudgeScoreInput,
    "criteriaValues" | "presentationId" | "value"
  >,
): Promise<SheetResolution> {
  const criteria = await tx
    .select({
      id: submodalityCriteria.id,
      kind: submodalityCriteria.kind,
      maximum: submodalityCriteria.maximum,
      name: submodalityCriteria.name,
    })
    .from(presentations)
    .innerJoin(
      choreographies,
      eq(choreographies.id, presentations.choreographyId),
    )
    .innerJoin(
      submodalityCriteria,
      eq(submodalityCriteria.submodalityId, choreographies.submodalityId),
    )
    .where(eq(presentations.id, input.presentationId))
    .orderBy(asc(submodalityCriteria.position));

  if (criteria.length === 0) {
    const value = parseScoreValue(input.value ?? "", singleScoreMaximum);

    return value === null
      ? { ok: false, result: { ok: false, reason: "invalid-value" } }
      : { ok: true, total: value, values: null };
  }

  const validated = validateSheetValues(criteria, input.criteriaValues ?? {});

  if (!validated.ok) {
    return {
      ok: false,
      result: {
        fieldErrors: validated.fieldErrors,
        ok: false,
        reason: "invalid-sheet",
      },
    };
  }

  return { ok: true, total: validated.total, values: validated.values };
}

/**
 * The sheet is saved as a whole: what was stored before is cleared and the
 * validated lines are written in its place, so a criterion the submodality no
 * longer has cannot survive as a stale value under a total that ignores it.
 */
async function writeSheetValues(
  tx: Transaction,
  scoreId: string,
  values: { criterionId: string; value: number }[] | null,
) {
  if (values === null) {
    return;
  }

  await tx
    .delete(scoreCriterionValues)
    .where(eq(scoreCriterionValues.scoreId, scoreId));

  await tx.insert(scoreCriterionValues).values(
    values.map((line) => ({
      criterionId: line.criterionId,
      scoreId,
      value: formatScoreValue(line.value),
    })),
  );
}

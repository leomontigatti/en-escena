import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  presentations,
  scoreCriterionValues,
  scores,
  submodalityCriteria,
} from "@/db/schema";
import {
  readJudgeWriteTarget,
  type JudgeWriteTarget,
} from "@/lib/judging/judge-write.server";
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
 *
 * A presentation a colleague disqualified mid-dialog takes the take and nothing
 * else. The judge is still owed their `Devolución` — the academy hears why —
 * but a score typed before the panel closed the presentation must not land on
 * top of what is already stored, so the value is left exactly as it was.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SaveJudgeScoreRefusal = "not-assigned" | "closed" | "invalid-value";

export type SaveJudgeScoreResult =
  | { disqualified?: true; ok: true }
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
  const committed = await db.transaction(
    async (tx) => await saveScoreWithin(tx, input, audio),
  );

  if (committed.previousKey) {
    await removeReplacedFeedbackAudio({
      storage: input.storage,
      storageKey: committed.previousKey,
    });
  }

  return committed.result;
}

/**
 * The whole write, once every refusal is out of the way. What it hands back
 * beside the result is the object the save orphaned, which is deleted only
 * after the commit.
 */
async function saveScoreWithin(
  tx: Transaction,
  input: SaveJudgeScoreInput,
  audio: FeedbackAudioSubmission,
): Promise<{ previousKey: string | null; result: SaveJudgeScoreResult }> {
  const prepared = await prepareScoreWrite(tx, input, audio);

  if (!prepared.ok) {
    return { previousKey: null, result: prepared.result };
  }

  const { sheet, storageKey, target } = prepared;

  await writeScore(tx, {
    judgeAssignmentId: target.judgeAssignmentId,
    sheet,
    storageKey,
  });

  return {
    previousKey:
      target.feedbackAudioStorageKey === storageKey
        ? null
        : target.feedbackAudioStorageKey,
    result: target.disqualified
      ? { disqualified: true, ok: true }
      : { ok: true },
  };
}

type PreparedScoreWrite =
  | { ok: false; result: SaveJudgeScoreResult }
  | {
      ok: true;
      /** Null on a disqualified presentation, which takes the take and nothing else. */
      sheet: { total: number; values: SheetLine[] | null } | null;
      storageKey: string | null;
      target: JudgeWriteTarget;
    };

/**
 * Everything the write depends on, resolved in the order the judge would want
 * it refused in: a presentation that is not theirs, then a day that closed,
 * then a value the sheet does not accept, and only then the upload — so a take
 * is never stored for a save that was never going to happen.
 */
async function prepareScoreWrite(
  tx: Transaction,
  input: SaveJudgeScoreInput,
  audio: FeedbackAudioSubmission,
): Promise<PreparedScoreWrite> {
  const found = await readJudgeWriteTarget(tx, input);

  if (!found.ok) {
    return { ok: false, result: { ok: false, reason: found.reason } };
  }

  const target = found.target;
  const sheet = target.disqualified ? null : await readSheet(tx, input);

  if (sheet && !sheet.ok) {
    return { ok: false, result: sheet.result };
  }

  const nextKey = await resolveFeedbackAudioKey({
    audio,
    eventId: target.eventId,
    judgeId: input.judgeId,
    presentationId: input.presentationId,
    storage: input.storage,
    storedKey: target.feedbackAudioStorageKey,
  });

  if (!nextKey.ok) {
    return {
      ok: false,
      result: {
        ok: false,
        reason: "invalid-audio",
        rejection: nextKey.rejection,
      },
    };
  }

  return {
    ok: true,
    sheet: sheet?.ok ? sheet : null,
    storageKey: nextKey.storageKey,
    target,
  };
}

/**
 * The judge's row, written as one upsert on their assignment so that a doubled
 * tap in the dark cannot yield two scores. `sheet` is null on a disqualified
 * presentation, and then the stored value is left exactly as it stands: the
 * take is all that save is allowed to change.
 */
async function writeScore(
  tx: Transaction,
  input: {
    judgeAssignmentId: string;
    sheet: { total: number; values: SheetLine[] | null } | null;
    storageKey: string | null;
  },
) {
  const value = input.sheet ? formatScoreValue(input.sheet.total) : null;
  const [saved] = await tx
    .insert(scores)
    .values({
      feedbackAudioStorageKey: input.storageKey,
      judgeAssignmentId: input.judgeAssignmentId,
      value,
    })
    .onConflictDoUpdate({
      target: scores.judgeAssignmentId,
      set: {
        feedbackAudioStorageKey: input.storageKey,
        updatedAt: new Date(),
        ...(input.sheet ? { value } : {}),
      },
    })
    .returning({ id: scores.id });

  if (input.sheet) {
    await writeSheetValues(tx, saved.id, input.sheet.values);
  }
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

type SheetLine = { criterionId: string; value: number };

type SheetResolution =
  | {
      ok: false;
      result: SaveJudgeScoreResult;
      total?: undefined;
      values?: undefined;
    }
  | {
      ok: true;
      total: number;
      values: SheetLine[] | null;
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
  values: SheetLine[] | null,
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

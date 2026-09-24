import { db } from "@/db";
import { scores } from "@/db/schema";
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
import {
  writeSheetValues,
  type SheetLine,
} from "@/lib/judging/sheet-values.server";
import { readPresentationCriteria } from "@/lib/judging/submodality-criteria.server";
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
  // The upload runs inside the transaction, so a rollback after it leaves the
  // object on the volume with no row pointing at it. What it cannot leave is no
  // trace: this holder is what the log line below has to name it by.
  const uploaded: UploadedTake = { storageKey: null };
  const committed = await db
    .transaction(
      async (tx) => await saveScoreWithin(tx, input, audio, uploaded),
    )
    .catch((thrown: unknown) => {
      logOrphanedTake(uploaded.storageKey, thrown);

      throw thrown;
    });

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
  uploaded: UploadedTake,
): Promise<{ previousKey: string | null; result: SaveJudgeScoreResult }> {
  const prepared = await prepareScoreWrite(tx, input, audio, uploaded);

  if (!prepared.ok) {
    return { previousKey: null, result: prepared.result };
  }

  const { sheet, storageKey, target } = prepared;

  if (carriesSomething({ sheet, storageKey, target })) {
    await writeScore(tx, {
      judgeAssignmentId: target.judgeAssignmentId,
      sheet,
      storageKey,
    });
  }

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
  uploaded: UploadedTake,
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
    uploaded,
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
 * Whether the save has anything to store. On a disqualified presentation the
 * take is all a save may write, so a judge who taps "Guardar" there with an
 * empty recorder and no score row of their own is asking to store nothing —
 * and a row carrying neither a value nor a take is not harmless: its mere
 * existence is what "evaluated" means, so it would lock the choreography and
 * the submodality's criteria and refuse the assignment's removal for good,
 * even after the panel reinstated the presentation.
 */
function carriesSomething(input: {
  sheet: { total: number; values: SheetLine[] | null } | null;
  storageKey: string | null;
  target: JudgeWriteTarget;
}): boolean {
  return (
    input.sheet !== null || input.storageKey !== null || input.target.hasScore
  );
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

  if (input.sheet?.values) {
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
  uploaded: UploadedTake;
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

  if (!uploaded.ok) {
    return { ok: false, rejection: uploaded.rejection };
  }

  input.uploaded.storageKey = uploaded.storageKey;

  return { ok: true, storageKey: uploaded.storageKey };
}

/** The object this save put on the volume, so a rollback can still name it. */
type UploadedTake = { storageKey: string | null };

/**
 * A take the transaction threw away, named in the log. There is nothing to undo
 * here — the judge is about to be told their save failed, which is true — but an
 * object nobody can find is worse than one a line in the log points at.
 */
function logOrphanedTake(storageKey: string | null, thrown: unknown) {
  if (storageKey === null) {
    return;
  }

  console.error("[storage:feedback-audio:orphan]", {
    detail: thrown instanceof Error ? thrown.message : String(thrown),
    storageKey,
  });
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
  const criteria = await readPresentationCriteria(tx, input.presentationId);

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

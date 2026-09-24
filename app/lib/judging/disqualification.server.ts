import { eq } from "drizzle-orm";

import { db } from "@/db";
import { presentations } from "@/db/schema";
import {
  readJudgeWriteTarget,
  type JudgeWriteRefusal,
} from "@/lib/judging/judge-write.server";

/**
 * A judge closing a presentation for the whole panel, and any assigned judge
 * opening it again. See docs/domain/judging.md, "Participation And Judging".
 *
 * Who disqualified is not stored: the panel settles it out loud in the theatre,
 * and a timestamp that any of them can clear says everything the app acts on.
 * Reinstating touches nothing but that timestamp, so the scores saved before
 * come back exactly as they were — which is what makes a mistaken
 * disqualification one tap to undo rather than a day's work to redo.
 */

export type DisqualificationResult =
  { ok: false; reason: JudgeWriteRefusal } | { ok: true };

export type DisqualificationInput = {
  judgeId: string;
  now?: Date;
  presentationId: string;
};

export async function disqualifyPresentation(
  input: DisqualificationInput,
): Promise<DisqualificationResult> {
  return await setDisqualifiedAt(input, new Date());
}

export async function reinstatePresentation(
  input: DisqualificationInput,
): Promise<DisqualificationResult> {
  return await setDisqualifiedAt(input, null);
}

async function setDisqualifiedAt(
  input: DisqualificationInput,
  disqualifiedAt: Date | null,
): Promise<DisqualificationResult> {
  return await db.transaction(async (tx) => {
    const target = await readJudgeWriteTarget(tx, input);

    if (!target.ok) {
      return { ok: false, reason: target.reason };
    }

    await tx
      .update(presentations)
      .set({ disqualifiedAt })
      .where(eq(presentations.id, input.presentationId));

    return { ok: true };
  });
}

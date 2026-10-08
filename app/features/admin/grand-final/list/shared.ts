import { z } from "zod";

import type {
  GrandFinalModalityRow,
  GrandFinalPicks,
} from "@/lib/grand-final/picks-overview.server";
import type { VoteCodeBatchRow } from "@/lib/grand-final/vote-codes.server";
import { requiredFieldMessage } from "@/lib/shared/forms";

/**
 * What administration's `Gran final` list and its server agree on. A module of
 * its own because the view imports the intent and the schema, and the server
 * module cannot reach the browser.
 */

/** Administration's write of any judge's `finalistPick`, with no window. */
export const setFinalistPickIntent = "set-finalist-pick";

export const finalistPickChangeSchema = z.object({
  academyId: z.string().trim().min(1, requiredFieldMessage),
  intent: z.literal(setFinalistPickIntent),
  judgeId: z.string().trim().min(1, requiredFieldMessage),
  modalityId: z.string().trim().min(1, requiredFieldMessage),
});

export type FinalistPickChangeFormValues = z.input<
  typeof finalistPickChangeSchema
>;

export type GrandFinalListActionData = {
  message: string;
  status: "error" | "success";
};

/**
 * Why `Cambiar elección de finalista` cannot run: it needs a judge of the event
 * and an academy eligible somewhere. Built by the server, which owns the rule
 * (docs/agents/form-feedback.md).
 */
export type FinalistPickChangeBlockReason = {
  code: "no-eligible-academy" | "no-event-judge";
  label: string;
};

export type GrandFinalListResult = {
  pickChangeBlockReasons: FinalistPickChangeBlockReason[];
  picks: GrandFinalPicks | null;
  selectedEventId: string | null;
  voteCodeBatches: VoteCodeBatchRow[];
};

/** The academy the judge picked in the modality, or "" when they have none. */
export function currentPick(
  modality: GrandFinalModalityRow | undefined,
  judgeId: string,
) {
  return (
    modality?.academies.find((academy) =>
      academy.pickedByJudgeIds.includes(judgeId),
    )?.academyId ?? ""
  );
}

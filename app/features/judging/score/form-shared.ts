import { useNavigation } from "react-router";
import { z } from "zod";

import type { FeedbackAudioFieldSubmission } from "@/lib/judging/feedback-audio-field";
import type { JudgeSheetCriterion } from "@/lib/judging/judge-list.server";
import { parseScoreValue, scoreValueMessage } from "@/lib/judging/score-value";
import { isRouteFormPending } from "@/lib/shared/forms";

/**
 * Whether this presentation's own save is in flight. A judge taps in a dark
 * theatre with their eyes on the stage, so "Guardar" has to say it took the
 * tap — otherwise the same score posts twice, and the second post lands on a
 * presentation a colleague may have disqualified in between.
 *
 * It is scoped to the intent and the presentation rather than to the router's
 * whole state, as the style guide requires: the revalidation that runs under
 * the form after every save is not the form working.
 */
export function useJudgeSavePending(presentationId: string): boolean {
  try {
    // oxlint-disable-next-line react-hooks/rules-of-hooks
    const navigation = useNavigation();

    return isRouteFormPending(navigation, {
      fields: { presentationId },
      intent: "save-score",
    });
  } catch {
    return false;
  }
}

/**
 * The single-score form. An empty field and a bad one read the same message,
 * because to the judge they are the same mistake: the score they meant to give
 * is not in there yet. See app/lib/judging/score-value.ts for the rule itself.
 */
export const judgeScoreFormSchema = z.object({
  value: z
    .string()
    .refine((value) => parseScoreValue(value) !== null, scoreValueMessage()),
});

export type JudgeScoreFormValues = z.infer<typeof judgeScoreFormSchema>;

/** The take is named for the storage, which keys it by event, presentation and judge. */
const feedbackAudioFileName = "devolucion.webm";

/**
 * What a judge's "Guardar" posts. It is built by hand rather than read off the
 * form element because the `Devolución` is bytes the form has no input for: a
 * take lives in memory until it is saved, so the score and the take are put
 * into one multipart body here and saved together.
 */
export function buildJudgeScoreSubmission({
  audio,
  presentationId,
  values,
}: {
  audio: FeedbackAudioFieldSubmission;
  presentationId: string;
  values: JudgeScoreFormValues;
}) {
  const body = new FormData();
  body.set("intent", "save-score");
  body.set("presentationId", presentationId);
  body.set("value", values.value);
  body.set("audioIntent", audio.intent);

  if (audio.intent === "replace") {
    body.set("audio", audio.blob, feedbackAudioFileName);
  }

  return body;
}

/**
 * The sheet's fields, built from the submodality's own criteria: each one is
 * read against its own maximum, so the message a judge gets names the number
 * they were typing against. Nested under `values` so the whole sheet is one
 * object the live total can watch.
 */
export function buildJudgeSheetFormSchema(
  criteria: readonly JudgeSheetCriterion[],
) {
  return z.object({
    values: z.object(
      Object.fromEntries(
        criteria.map((criterion) => [
          criterion.id,
          z
            .string()
            .refine(
              (value) => parseScoreValue(value, criterion.maximum) !== null,
              scoreValueMessage(criterion.maximum),
            ),
        ]),
      ),
    ),
  });
}

export type JudgeSheetFormValues = { values: Record<string, string> };

/**
 * An adding criterion starts empty and a deduction starts at 0. A stray tap
 * must never store a real 0 for something the judge meant to score, while a
 * deduction of 0 is the ordinary case and asking for it every time would be
 * three more taps per presentation.
 */
export function initialJudgeSheetValues(
  criteria: readonly JudgeSheetCriterion[],
): JudgeSheetFormValues {
  return {
    values: Object.fromEntries(
      criteria.map((criterion) => [
        criterion.id,
        criterion.kind === "deducts" ? "0" : "",
      ]),
    ),
  };
}

/** Each filled line rides as its own field, named for the criterion it answers. */
export const sheetCriterionFieldPrefix = "criterio.";

export function buildJudgeSheetSubmission({
  audio,
  presentationId,
  values,
}: {
  audio: FeedbackAudioFieldSubmission;
  presentationId: string;
  values: JudgeSheetFormValues;
}) {
  const body = new FormData();
  body.set("intent", "save-score");
  body.set("presentationId", presentationId);
  body.set("audioIntent", audio.intent);

  for (const [criterionId, value] of Object.entries(values.values)) {
    body.set(`${sheetCriterionFieldPrefix}${criterionId}`, value);
  }

  if (audio.intent === "replace") {
    body.set("audio", audio.blob, feedbackAudioFileName);
  }

  return body;
}

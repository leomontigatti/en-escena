import { z } from "zod";

import type { FeedbackAudioFieldSubmission } from "@/lib/judging/feedback-audio-field";
import { parseScoreValue, scoreValueMessage } from "@/lib/judging/score-value";

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

import { requireJudgePanelUser } from "@/lib/auth/internal-navigation.server";
import {
  type FeedbackAudioSubmission,
  saveJudgeScore,
} from "@/lib/judging/save-score.server";
import { scoreValueMessage } from "@/lib/judging/score-value";
import { readFormString } from "@/lib/shared/forms";
import { formatUploadRejection } from "@/lib/storage/asset-kinds";

/**
 * The judge panel's single action. A judge scores from a dialog over their own
 * list, so nothing here redirects: the result goes back as `actionData`, the
 * list revalidates and the client decides which presentation to open next. See
 * docs/agents/form-feedback.md.
 *
 * The two refusals are deliberately different in kind. A judge writing on a
 * presentation they are not assigned to is not a mistake the interface can
 * make, so it is a 403; a day that closed while the dialog was open is an
 * ordinary thing to run into mid-show, so it is an error toast over the form
 * the judge is still looking at.
 *
 * The `Devolución` is posted as multipart with the score, because the judge's
 * one "Guardar" saves both.
 */

export type JudgePanelActionData = {
  fieldErrors?: Record<string, string>;
  message: string;
  status: "success" | "error";
  values?: Record<string, string>;
};

const savedScoreMessage = "Guardaste el puntaje.";

const invalidScoreMessage = "Revisá el puntaje.";

const invalidFeedbackAudioMessage = "No se pudo guardar la devolución.";

const closedJudgingDayMessage =
  "La jornada ya cerró, no se pueden guardar puntajes.";

export async function handleJudgePanelAction(
  request: Request,
): Promise<JudgePanelActionData> {
  const judge = await requireJudgePanelUser(request);
  const formData = await request.formData();
  const presentationId = readFormString(formData, "presentationId");
  const value = readFormString(formData, "value");
  const result = await saveJudgeScore({
    audio: readFeedbackAudioSubmission(formData),
    judgeId: judge.id,
    presentationId,
    value,
  });

  if (result.ok) {
    return { message: savedScoreMessage, status: "success" };
  }

  if (result.reason === "not-assigned") {
    throw new Response("Forbidden", { status: 403 });
  }

  if (result.reason === "invalid-audio") {
    return {
      fieldErrors: { audio: formatUploadRejection(result.rejection) },
      message: invalidFeedbackAudioMessage,
      status: "error",
      values: { presentationId, value },
    };
  }

  if (result.reason === "closed") {
    return {
      message: closedJudgingDayMessage,
      status: "error",
      values: { presentationId, value },
    };
  }

  return {
    fieldErrors: { value: scoreValueMessage() },
    message: invalidScoreMessage,
    status: "error",
    values: { presentationId, value },
  };
}

/**
 * What the form asked for the stored take. Anything that is not an explicit
 * `replace` carrying bytes, or an explicit `remove`, is read as "leave it
 * alone": an empty file part is what a browser sends for a recorder that was
 * never used, and must not be mistaken for a deletion.
 */
function readFeedbackAudioSubmission(
  formData: FormData,
): FeedbackAudioSubmission {
  const intent = readFormString(formData, "audioIntent");

  if (intent === "remove") {
    return { intent: "remove" };
  }

  const file = formData.get("audio");

  if (intent === "replace" && file instanceof Blob && file.size > 0) {
    return { file, intent: "replace" };
  }

  return { intent: "keep" };
}

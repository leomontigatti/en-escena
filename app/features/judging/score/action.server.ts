import { requireJudgePanelUser } from "@/lib/auth/internal-navigation.server";
import {
  disqualifyPresentation,
  reinstatePresentation,
  type DisqualificationResult,
} from "@/lib/judging/disqualification.server";
import {
  type FeedbackAudioSubmission,
  saveJudgeScore,
} from "@/lib/judging/save-score.server";
import { scoreValueMessage } from "@/lib/judging/score-value";
import { readFormString } from "@/lib/shared/forms";
import { readSheetValues } from "./form-shared";
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
 *
 * Disqualifying and reinstating answer the same way, and carry the intent back
 * with them: only a saved score moves the judge on to the next presentation,
 * while closing or reopening one leaves them looking at it.
 */

export type JudgePanelIntent = "disqualify" | "reinstate" | "save-score";

export type JudgePanelActionData = {
  fieldErrors?: Record<string, string>;
  intent: JudgePanelIntent;
  message: string;
  status: "success" | "error";
  values?: Record<string, string>;
};

const savedScoreMessage = "Guardaste el puntaje.";

const invalidScoreMessage = "Revisá el puntaje.";

const invalidFeedbackAudioMessage = "No se pudo guardar la devolución.";

const closedJudgingDayMessage =
  "La jornada ya cerró, no se pueden guardar puntajes.";

const disqualifiedSaveMessage =
  "La presentación está descalificada, se guardó solo la devolución.";

const disqualifiedMessage = "Descalificaste la presentación.";

const reinstatedMessage = "La presentación vuelve a calificarse.";

const closedDisqualificationMessage =
  "La jornada ya cerró, no se puede cambiar la descalificación.";

export async function handleJudgePanelAction(
  request: Request,
): Promise<JudgePanelActionData> {
  const judge = await requireJudgePanelUser(request);
  const formData = await request.formData();
  const presentationId = readFormString(formData, "presentationId");
  const intent = readFormString(formData, "intent");

  if (intent === "disqualify") {
    return answerDisqualification(
      "disqualify",
      disqualifiedMessage,
      await disqualifyPresentation({ judgeId: judge.id, presentationId }),
    );
  }

  if (intent === "reinstate") {
    return answerDisqualification(
      "reinstate",
      reinstatedMessage,
      await reinstatePresentation({ judgeId: judge.id, presentationId }),
    );
  }

  return await saveScore(judge.id, formData, presentationId);
}

/**
 * Both intents answer alike: a judge who is not on the panel for this
 * presentation is a 403, and a day that closed is a toast over the form they
 * are still looking at.
 */
function answerDisqualification(
  intent: JudgePanelIntent,
  message: string,
  result: DisqualificationResult,
): JudgePanelActionData {
  if (result.ok) {
    return { intent, message, status: "success" };
  }

  if (result.reason === "not-assigned") {
    throw new Response("Forbidden", { status: 403 });
  }

  return {
    intent,
    message: closedDisqualificationMessage,
    status: "error",
  };
}

async function saveScore(
  judgeId: string,
  formData: FormData,
  presentationId: string,
): Promise<JudgePanelActionData> {
  const value = readFormString(formData, "value");
  const result = await saveJudgeScore({
    audio: readFeedbackAudioSubmission(formData),
    criteriaValues: readSheetValues(formData),
    judgeId,
    presentationId,
    value,
  });
  const intent = "save-score" as const;

  if (result.ok) {
    return {
      intent,
      message: result.disqualified
        ? disqualifiedSaveMessage
        : savedScoreMessage,
      status: "success",
    };
  }

  if (result.reason === "not-assigned") {
    throw new Response("Forbidden", { status: 403 });
  }

  if (result.reason === "invalid-audio") {
    return {
      fieldErrors: { audio: formatUploadRejection(result.rejection) },
      intent,
      message: invalidFeedbackAudioMessage,
      status: "error",
      values: { presentationId, value },
    };
  }

  if (result.reason === "invalid-sheet") {
    return {
      fieldErrors: result.fieldErrors,
      intent,
      message: invalidScoreMessage,
      status: "error",
      values: { presentationId },
    };
  }

  if (result.reason === "closed") {
    return {
      intent,
      message: closedJudgingDayMessage,
      status: "error",
      values: { presentationId, value },
    };
  }

  return {
    fieldErrors: { value: scoreValueMessage() },
    intent,
    message: invalidScoreMessage,
    status: "error",
    values: { presentationId, value },
  };
}

/**
 * The sheet's lines, named for the criterion each one answers. The save reads
 * the submodality's criteria itself, so anything posted for a criterion it does
 * not have is simply never looked at.
 */
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

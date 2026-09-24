import { requireJudgePanelUser } from "@/lib/auth/internal-navigation.server";
import { saveJudgeScore } from "@/lib/judging/save-score.server";
import { scoreValueMessage } from "@/lib/judging/score-value";
import { readFormString } from "@/lib/shared/forms";

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
 */

export type JudgePanelActionData = {
  fieldErrors?: Record<string, string>;
  message: string;
  status: "success" | "error";
  values?: Record<string, string>;
};

const savedScoreMessage = "Guardaste el puntaje.";

const invalidScoreMessage = "Revisá el puntaje.";

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

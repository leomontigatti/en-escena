import { data } from "react-router";

import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { canWriteInAdminPanel } from "@/lib/auth/user-role.shared";
import {
  editScore,
  setPresentationDisqualified,
  type ScoreSettlementResult,
} from "@/lib/judging/score-settlement.server";
import {
  readPresentationEvaluation,
  type AdministrationEvaluation,
} from "@/lib/judging/presentation-evaluation.server";
import {
  scoreValueMessage,
  sheetValuesMessage,
} from "@/lib/judging/score-value";
import { readSheetValues } from "@/features/judging/score/form-shared";
import { readFormString } from "@/lib/shared/forms";
import { readFormData } from "@/lib/shared/read-form-data";

/**
 * The route adapter of the scores view: who may read one presentation's panel
 * and who may act on it. Only administration reads it and writes on it: the
 * page is not among the auditor's sections (docs/domain/access.md), so the
 * loader and every write are asked of `requireAdminPanelWriter`.
 */

export type PresentationScoresLoaderData = {
  canWrite: boolean;
  presentation: AdministrationEvaluation;
};

/**
 * A refusal is told in `message` alone, as a toast: the fields show only what
 * the form's own rule caught before posting.
 */
export type PresentationScoresActionData = {
  message: string;
  /** The score an accepted edit saved, so only its own form settles on it. */
  scoreId?: string;
  status: "error" | "success";
};

const presentationNotFoundMessage = "No se encontró la presentación buscada.";

export async function loadPresentationScoresRouteData(input: {
  params: { presentationId?: string };
  request: Request;
}): Promise<PresentationScoresLoaderData> {
  const user = await requireAdminPanelWriter(input.request);
  const presentation = await readPresentationEvaluation(
    { kind: "administration" },
    { presentationId: input.params.presentationId ?? "" },
  );

  if (!presentation) {
    throw new Response(presentationNotFoundMessage, { status: 404 });
  }

  return { canWrite: canWriteInAdminPanel(user.role), presentation };
}

const savedScoreMessage = "Guardaste el puntaje.";

const disqualifiedMessage = "Descalificaste la presentación.";

const reinstatedMessage = "La presentación vuelve a calificarse.";

const unknownScoreMessage = "No se encontró el puntaje que se quiso editar.";

const unknownIntentMessage = "No se reconoció la acción solicitada.";

const withdrawnPresentationMessage =
  "La coreografía fue retirada: su presentación no se juzga.";

/**
 * Administration's writes on one presentation's panel. Every one of them is
 * asked of `requireAdminPanelWriter`, so a post from anyone else is refused
 * with 403 rather than quietly ignored: a write that seemed to land would be
 * worse than one that plainly did not.
 *
 * Nothing here redirects — the page the administrator is editing is the page
 * they stay on — so the result goes back as `actionData` and the loader
 * revalidates the panel underneath it. See docs/agents/form-feedback.md.
 */
export async function handlePresentationScoresAction(input: {
  params: { presentationId?: string };
  request: Request;
}): Promise<PresentationScoresActionData | ReturnType<typeof data>> {
  await requireAdminPanelWriter(input.request);

  const formData = await readFormData(input.request);
  const presentationId = input.params.presentationId ?? "";
  const intent = readFormString(formData, "intent");

  if (intent === "disqualify" || intent === "reinstate") {
    return answerDisqualification(
      intent === "disqualify" ? disqualifiedMessage : reinstatedMessage,
      await setPresentationDisqualified({
        disqualified: intent === "disqualify",
        presentationId,
      }),
    );
  }

  const scoreId = readFormString(formData, "scoreId");

  if (intent === "edit-score") {
    return answerEdit(
      scoreId,
      await editScore({
        criteriaValues: readSheetValues(formData),
        presentationId,
        scoreId,
        value: readFormString(formData, "value"),
      }),
    );
  }

  return data(
    { message: unknownIntentMessage, status: "error" as const },
    { status: 400 },
  );
}

/**
 * A settled disqualification, or the 404 for the presentation it could not
 * find. It names the presentation rather than a score, as `answerEdit` does, or
 * an administrator is told to look for a score when the link they followed is
 * the broken part.
 */
function answerDisqualification(
  message: string,
  result: ScoreSettlementResult,
): PresentationScoresActionData | ReturnType<typeof data> {
  if (result.ok) {
    return { message, status: "success" };
  }

  if (result.reason === "withdrawn") {
    return data(
      { message: withdrawnPresentationMessage, status: "error" as const },
      { status: 409 },
    );
  }

  return data(
    { message: presentationNotFoundMessage, status: "error" as const },
    { status: 404 },
  );
}

/**
 * A refused edit says the rule the value broke: a single value's own, or the
 * sheet's when a line was out of range. A score the page does not hold is a
 * different thing altogether.
 */
function answerEdit(
  scoreId: string,
  result: ScoreSettlementResult,
): PresentationScoresActionData | ReturnType<typeof data> {
  if (result.ok) {
    return { message: savedScoreMessage, scoreId, status: "success" };
  }

  if (result.reason === "not-found") {
    return data(
      { message: unknownScoreMessage, status: "error" as const },
      { status: 404 },
    );
  }

  return {
    message:
      result.reason === "invalid-sheet"
        ? sheetValuesMessage
        : scoreValueMessage(),
    status: "error",
  };
}

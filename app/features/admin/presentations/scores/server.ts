import { data } from "react-router";

import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import {
  editScore,
  setPresentationDisqualified,
  type ScoreSettlementResult,
} from "@/lib/judging/score-settlement.server";
import {
  readPresentationScores,
  type PresentationScoresView,
} from "@/lib/judging/presentation-scores.server";
import {
  scoreValueMessage,
  sheetValuesMessage,
} from "@/lib/judging/score-value";
import { readSheetValues } from "@/features/judging/score/form-shared";
import { readFormString } from "@/lib/shared/forms";

/**
 * The route adapter of the scores view: who may read one presentation's panel
 * and who may act on it. Administration and the auditor both read the whole
 * thing — the auditor is there to check the panel's work — and only
 * administration writes, so every write is asked of `requireAdminUser` and an
 * auditor's is refused with 403 rather than hidden behind a disabled button.
 */

export type PresentationScoresLoaderData = {
  canEdit: boolean;
  presentation: PresentationScoresView;
};

/**
 * A refusal is told in `message` alone, as a toast: the fields show only what
 * the form's own rule caught before posting.
 */
export type PresentationScoresActionData = {
  message: string;
  status: "error" | "success";
};

const presentationNotFoundMessage = "No se encontró la presentación buscada.";

export async function loadPresentationScoresRouteData(input: {
  params: { presentationId?: string };
  request: Request;
}): Promise<PresentationScoresLoaderData> {
  const user = await requireInternalUser(input.request, ["admin"]);
  const presentation = await readPresentationScores({
    presentationId: input.params.presentationId ?? "",
  });

  if (!presentation) {
    throw new Response(presentationNotFoundMessage, { status: 404 });
  }

  return { canEdit: user.role === "admin", presentation };
}

const savedScoreMessage = "Guardaste el puntaje.";

const disqualifiedMessage = "Descalificaste la presentación.";

const reinstatedMessage = "La presentación vuelve a calificarse.";

const unknownScoreMessage = "No se encontró el puntaje que se quiso editar.";

const unknownIntentMessage = "No se reconoció la acción solicitada.";

/**
 * Administration's writes on one presentation's panel. Every one of them is
 * asked of `requireAdminUser`, so an auditor reading the page is refused with
 * 403 rather than quietly ignored: the auditor is there to check the panel's
 * work, and a write that seemed to land would be worse than one that plainly
 * did not.
 *
 * Nothing here redirects — the page the administrator is editing is the page
 * they stay on — so the result goes back as `actionData` and the loader
 * revalidates the panel underneath it. See docs/agents/form-feedback.md.
 */
export async function handlePresentationScoresAction(input: {
  params: { presentationId?: string };
  request: Request;
}): Promise<PresentationScoresActionData | ReturnType<typeof data>> {
  await requireAdminUser(input.request);

  const formData = await input.request.formData();
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
  return result.ok
    ? { message, status: "success" }
    : data(
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
  result: ScoreSettlementResult,
): PresentationScoresActionData | ReturnType<typeof data> {
  if (result.ok) {
    return { message: savedScoreMessage, status: "success" };
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

import { data } from "react-router";

import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import {
  annulScore,
  editScore,
  setPresentationDisqualified,
  type AdminScoreResult,
} from "@/lib/judging/admin-scores.server";
import {
  readPresentationScores,
  type PresentationScoresView,
} from "@/lib/judging/presentation-scores.server";
import { scoreValueMessage } from "@/lib/judging/score-value";
import { sheetCriterionFieldPrefix } from "@/features/judging/score/form-shared";
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

export type PresentationScoresActionData = {
  /**
   * Keyed by the score being edited for a single value, and by criterion for a
   * sheet, because the page shows the whole panel at once: an error has to say
   * which judge's field it belongs to.
   */
  fieldErrors?: Record<string, string>;
  message: string;
  status: "error" | "success";
};

const presentationNotFoundMessage = "No se encontró la presentación buscada.";

export async function loadPresentationScoresRouteData(input: {
  params: { presentationId?: string };
  request: Request;
}): Promise<PresentationScoresLoaderData> {
  const user = await requireInternalUser(input.request, ["admin", "auditor"]);
  const presentation = await readPresentationScores({
    presentationId: input.params.presentationId ?? "",
  });

  if (!presentation) {
    throw new Response(presentationNotFoundMessage, { status: 404 });
  }

  return { canEdit: user.role === "admin", presentation };
}

const savedScoreMessage = "Guardaste el puntaje.";

const invalidScoreMessage = "Revisá el puntaje.";

const annulledMessage = "Anulaste el puntaje.";

const restoredMessage = "El puntaje vuelve a contar.";

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
    return answer(
      intent === "disqualify" ? disqualifiedMessage : reinstatedMessage,
      await setPresentationDisqualified({
        disqualified: intent === "disqualify",
        presentationId,
      }),
    );
  }

  const scoreId = readFormString(formData, "scoreId");

  if (intent === "annul-score") {
    return answer(
      readFormString(formData, "annulled") === "true"
        ? annulledMessage
        : restoredMessage,
      await annulScore({
        annulled: readFormString(formData, "annulled") === "true",
        presentationId,
        scoreId,
      }),
    );
  }

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

function answer(
  message: string,
  result: AdminScoreResult,
): PresentationScoresActionData | ReturnType<typeof data> {
  return result.ok
    ? { message, status: "success" }
    : data(
        { message: unknownScoreMessage, status: "error" as const },
        { status: 404 },
      );
}

/**
 * A refused edit names the field that has to change: the score's own row for a
 * single value, and the criterion's line on a sheet. A score the page does not
 * hold is a different thing altogether and has no field to point at.
 */
function answerEdit(
  scoreId: string,
  result: AdminScoreResult,
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
    fieldErrors:
      result.reason === "invalid-sheet"
        ? result.fieldErrors
        : { [scoreId]: scoreValueMessage() },
    message: invalidScoreMessage,
    status: "error",
  };
}

/** The sheet's lines, named for the criterion each one answers. */
function readSheetValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (
      key.startsWith(sheetCriterionFieldPrefix) &&
      typeof value === "string"
    ) {
      values[key.slice(sheetCriterionFieldPrefix.length)] = value;
    }
  }

  return values;
}

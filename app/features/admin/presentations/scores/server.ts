import { data } from "react-router";

import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import {
  readPresentationScores,
  type PresentationScoresView,
} from "@/lib/judging/presentation-scores.server";

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

export async function handlePresentationScoresAction(input: {
  params: { presentationId?: string };
  request: Request;
}): Promise<PresentationScoresActionData | ReturnType<typeof data>> {
  await requireAdminUser(input.request);
  await input.request.formData();

  return data(
    {
      message: "No se reconoció la acción solicitada.",
      status: "error" as const,
    },
    { status: 400 },
  );
}

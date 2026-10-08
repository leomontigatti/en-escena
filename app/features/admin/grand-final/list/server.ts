import { data, redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import {
  setFinalistPick,
  type SetFinalistPickResult,
} from "@/lib/grand-final/finalist-pick.server";
import {
  readGrandFinalPicks,
  type GrandFinalPicks,
} from "@/lib/grand-final/picks-overview.server";
import { readFormString } from "@/lib/shared/forms";

import {
  finalistPickChangeSchema,
  type FinalistPickChangeBlockReason,
  type GrandFinalListActionData,
  type GrandFinalListResult,
} from "./shared";

/**
 * Administration's `Gran final` list. Behind `requireAdminPanelUser`: the
 * auditor reads none of it, and its section is not in their navigation.
 */
export async function loadGrandFinalListRouteData(
  request: Request,
): Promise<GrandFinalListResult> {
  await requireAdminPanelUser(request);
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const { selectedEventId } = eventContext;
  const picks = selectedEventId
    ? await readGrandFinalPicks(selectedEventId)
    : null;

  return {
    pickChangeBlockReasons: picks ? readPickChangeBlockReasons(picks) : [],
    picks,
    selectedEventId,
  };
}

function readPickChangeBlockReasons(
  picks: GrandFinalPicks,
): FinalistPickChangeBlockReason[] {
  const reasons: FinalistPickChangeBlockReason[] = [];

  if (picks.judges.length === 0) {
    reasons.push({
      code: "no-event-judge",
      label:
        "El evento activo todavía no tiene jueces asignados a sus presentaciones.",
    });
  }

  if (
    !picks.modalities.some((modality) =>
      modality.academies.some((academy) => academy.eligible),
    )
  ) {
    reasons.push({
      code: "no-eligible-academy",
      label: "Ninguna academia cumple los requisitos en ninguna modalidad.",
    });
  }

  return reasons;
}

const refusalMessages: Record<
  Extract<SetFinalistPickResult, { ok: false }>["reason"],
  string
> = {
  "not-eligible":
    "Esa academia no cumple los requisitos de la Gran final en esta modalidad. Elegí otra.",
  "not-found":
    "La modalidad o el juez ya no están en el evento activo. Revisá la lista y volvé a intentarlo.",
};

/**
 * The change of a judge's pick from the list's dialog. It stays: the answer
 * goes back as data for a toast and the list revalidates.
 */
export async function handleGrandFinalListAction(
  request: Request,
): Promise<GrandFinalListActionData | ReturnType<typeof data>> {
  await requireAdminPanelUser(request);
  const formData = await request.formData();
  const parsed = finalistPickChangeSchema.safeParse({
    academyId: readFormString(formData, "academyId"),
    intent: readFormString(formData, "intent"),
    judgeId: readFormString(formData, "judgeId"),
    modalityId: readFormString(formData, "modalityId"),
  });

  if (!parsed.success) {
    return data(
      {
        message:
          "Elegí la modalidad, el juez y la academia para guardar la elección de finalista.",
        status: "error" as const,
      },
      { status: 400 },
    );
  }

  const result = await setFinalistPick(parsed.data);

  if (result.ok) {
    return {
      message: "Guardaste la elección de finalista.",
      status: "success",
    };
  }

  return data(
    { message: refusalMessages[result.reason], status: "error" as const },
    { status: result.reason === "not-found" ? 404 : 409 },
  );
}

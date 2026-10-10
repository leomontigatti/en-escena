import { data } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  findHideBlocker,
  findPublishBlocker,
  findTieBreakBlockers,
  hideGrandFinalResult,
  publishGrandFinalResult,
  readGrandFinalResult,
  type GrandFinalResult,
  type HideBlocker,
  type PublishBlocker,
  type TieBreakBlocker,
} from "@/lib/grand-final/result.server";
import {
  closeVotingRound,
  openTieBreakRound,
  openVotingRound,
  readVotingRoundOpenBlockers,
  type VotingRoundOpenBlocker,
} from "@/lib/grand-final/voting-round.server";
import { readFormString } from "@/lib/shared/forms";

import type { GrandFinalListActionData } from "../list/shared";
import {
  closeVotingRoundIntent,
  hideGrandFinalResultIntent,
  openTieBreakRoundIntent,
  openVotingRoundIntent,
  publishGrandFinalResultIntent,
  type VotingRoundBlockReason,
  type VotingRoundListState,
  type VotingRoundResultView,
} from "./shared";

const notOpenReason: VotingRoundBlockReason = {
  code: "not-open",
  label: "La votación no está abierta.",
};

function describeOpenBlocker(
  blocker: VotingRoundOpenBlocker,
): VotingRoundBlockReason {
  switch (blocker.code) {
    case "already-open":
      return { code: blocker.code, label: "La votación ya está abierta." };
    case "already-closed":
      return {
        code: blocker.code,
        label:
          "La votación ya se cerró y no se vuelve a abrir. Si terminó con empate en el primer puesto, abrí el desempate.",
      };
    case "no-finalists":
      return {
        code: blocker.code,
        label: "Ningún juez eligió todavía una academia finalista.",
      };
    case "missing-banners":
      return {
        code: blocker.code,
        label: `Faltan banners de ${blocker.academyNames.join(", ")}: cada finalista necesita sus dos banners.`,
      };
  }
}

const noRoundLabel = "La votación todavía no se abrió.";

const publishBlockerLabels: Record<PublishBlocker, string> = {
  "already-published": "El resultado ya está publicado.",
  "no-round": noRoundLabel,
  "round-open":
    "La votación está abierta: el resultado se publica después de cerrarla.",
  "tie-pending":
    "Hay un empate en el primer puesto: abrí el desempate antes de publicar.",
};

const hideBlockerLabels: Record<HideBlocker, string> = {
  "not-published": "El resultado no está publicado.",
};

const tieBreakBlockerLabels: Record<TieBreakBlocker, string> = {
  "already-tie-break":
    "El desempate ya se hizo: el evento tiene dos votaciones como máximo.",
  "no-round": noRoundLabel,
  "no-tie": "La votación no terminó con empate en el primer puesto.",
  "round-open":
    "La votación está abierta: el desempate se abre después de cerrarla.",
};

function toReasons<Code extends VotingRoundBlockReason["code"]>(
  codes: (Code | null)[],
  labels: Record<Code, string>,
): VotingRoundBlockReason[] {
  return codes.flatMap((code) => (code ? [{ code, label: labels[code] }] : []));
}

function toResultView(
  result: GrandFinalResult | null,
): VotingRoundResultView | null {
  if (result?.status !== "closed") {
    return null;
  }

  return {
    entries: result.entries,
    outcome: result.outcome,
    published: result.publishedAt !== null,
    roundNumber: result.roundNumber,
    tieBrokenByCodeVotes: result.tieBrokenByCodeVotes,
  };
}

/**
 * The round's state for the list, with why each of its actions cannot run,
 * and the last round's result once it closed.
 */
export async function readVotingRoundListState(
  eventId: string,
): Promise<VotingRoundListState> {
  const [result, openBlockers] = await Promise.all([
    readGrandFinalResult(eventId),
    readVotingRoundOpenBlockers(eventId),
  ]);
  const isOpen = result?.status === "open";

  return {
    closeBlockReasons: isOpen ? [] : [notOpenReason],
    hideBlockReasons: toReasons([findHideBlocker(result)], hideBlockerLabels),
    openBlockReasons: openBlockers.map(describeOpenBlocker),
    publishBlockReasons: toReasons(
      [findPublishBlocker(result)],
      publishBlockerLabels,
    ),
    result: toResultView(result),
    roundId: result?.roundId ?? null,
    status: result ? result.status : null,
    tieBreakBlockReasons: toReasons(
      findTieBreakBlockers(result),
      tieBreakBlockerLabels,
    ),
  };
}

function refusal(message: string, status: number) {
  return data({ message, status: "error" as const }, { status });
}

type IntentAnswer =
  GrandFinalListActionData | ReturnType<typeof data<GrandFinalListActionData>>;

/**
 * Opens or closes the active event's round, opens its `Desempate`, and
 * publishes or hides its result. Each stays on the list, which revalidates
 * and shows the round as it now stands; the answer is a toast. A refusal
 * names every reason, as the dialog the menu would have opened does. The
 * caller has already checked the admin panel guard and read the form.
 */
export async function handleVotingRoundIntent(
  request: Request,
  formData: FormData,
): Promise<IntentAnswer> {
  const { selectedEventId } = await loadEventContext(request);

  if (!selectedEventId) {
    return refusal(
      "Elegí un evento activo para manejar la votación de la Gran final.",
      409,
    );
  }

  switch (readFormString(formData, "intent")) {
    case openVotingRoundIntent:
      return await openRound(selectedEventId);
    case closeVotingRoundIntent:
      return await closeRound(
        selectedEventId,
        readFormString(formData, "roundId"),
      );
    case openTieBreakRoundIntent:
      return await openTieBreak(selectedEventId);
    case publishGrandFinalResultIntent:
      return await publishResult(selectedEventId);
    case hideGrandFinalResultIntent:
      return await hideResult(selectedEventId);
    default:
      return refusal("Esa acción de la votación no existe.", 400);
  }
}

async function openRound(eventId: string): Promise<IntentAnswer> {
  const result = await openVotingRound({ eventId });

  if (!result.ok) {
    return refusal(
      `No se puede abrir la votación. ${result.blockers
        .map((blocker) => describeOpenBlocker(blocker).label)
        .join(" ")}`,
      409,
    );
  }

  return {
    message:
      "Abriste la votación. El público ya puede votar con sus códigos QR.",
    status: "success",
  };
}

/**
 * Closes the round the dialog was confirmed over, and no other: once it
 * closed, a late confirmation is refused as not open.
 */
async function closeRound(
  eventId: string,
  roundId: string,
): Promise<IntentAnswer> {
  const result = await closeVotingRound({ eventId, roundId });

  if (!result.ok) {
    return refusal(
      `No se puede cerrar la votación. ${notOpenReason.label}`,
      409,
    );
  }

  return {
    message: "Cerraste la votación. Ya no se aceptan votos.",
    status: "success",
  };
}

async function openTieBreak(eventId: string): Promise<IntentAnswer> {
  const result = await openTieBreakRound({ eventId });

  if (!result.ok) {
    return refusal(
      `No se puede abrir el desempate. ${result.reasons
        .map((reason) => tieBreakBlockerLabels[reason])
        .join(" ")}`,
      409,
    );
  }

  return {
    message:
      "Abriste el desempate. El público ya puede votar entre las academias empatadas.",
    status: "success",
  };
}

async function publishResult(eventId: string): Promise<IntentAnswer> {
  const result = await publishGrandFinalResult({ eventId });

  if (!result.ok) {
    return refusal(
      `No se puede publicar el resultado. ${publishBlockerLabels[result.reason]}`,
      409,
    );
  }

  return {
    message: "Publicaste el resultado. Ya se ve en /votar.",
    status: "success",
  };
}

async function hideResult(eventId: string): Promise<IntentAnswer> {
  const result = await hideGrandFinalResult({ eventId });

  if (!result.ok) {
    return refusal(
      `No se puede ocultar el resultado. ${hideBlockerLabels[result.reason]}`,
      409,
    );
  }

  return {
    message: "Ocultaste el resultado. Ya no se ve en /votar.",
    status: "success",
  };
}

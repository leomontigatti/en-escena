import { data } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  closeVotingRound,
  openVotingRound,
  readCurrentVotingRound,
  readVotingRoundOpenBlockers,
  type VotingRoundOpenBlocker,
} from "@/lib/grand-final/voting-round.server";
import { readFormString } from "@/lib/shared/forms";

import type { GrandFinalListActionData } from "../list/shared";
import {
  openVotingRoundIntent,
  type VotingRoundBlockReason,
  type VotingRoundListState,
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
        label: "La votación ya se cerró: el evento tiene una sola votación.",
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

/** The round's state for the list, with why each of its actions cannot run. */
export async function readVotingRoundListState(
  eventId: string,
): Promise<VotingRoundListState> {
  const [round, openBlockers] = await Promise.all([
    readCurrentVotingRound(eventId),
    readVotingRoundOpenBlockers(eventId),
  ]);
  const isOpen = round !== null && round.closedAt === null;

  return {
    closeBlockReasons: isOpen ? [] : [notOpenReason],
    openBlockReasons: openBlockers.map(describeOpenBlocker),
    status: round ? (isOpen ? "open" : "closed") : null,
  };
}

function refusal(message: string, status: number) {
  return data({ message, status: "error" as const }, { status });
}

/**
 * Opens or closes the active event's round. Both stay on the list, which
 * revalidates and shows the round as it now stands; the answer is a toast. A
 * refusal names every reason, as the dialog the menu would have opened does.
 * The caller has already checked the admin panel guard and read the form.
 */
export async function handleVotingRoundIntent(
  request: Request,
  formData: FormData,
): Promise<
  GrandFinalListActionData | ReturnType<typeof data<GrandFinalListActionData>>
> {
  const { selectedEventId } = await loadEventContext(request);

  if (!selectedEventId) {
    return refusal(
      "Elegí un evento activo para abrir o cerrar la votación.",
      409,
    );
  }

  if (readFormString(formData, "intent") === openVotingRoundIntent) {
    const result = await openVotingRound({ eventId: selectedEventId });

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

  const result = await closeVotingRound({ eventId: selectedEventId });

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

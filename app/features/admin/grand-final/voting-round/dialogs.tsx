import { useFetcher } from "react-router";

import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { GrandFinalListActionData } from "../list/shared";
import {
  closeVotingRoundIntent,
  hideGrandFinalResultIntent,
  openTieBreakRoundIntent,
  openVotingRoundIntent,
  publishGrandFinalResultIntent,
  type VotingRoundBlockReason,
  type VotingRoundListState,
} from "./shared";

export type VotingRoundAction =
  "close" | "hide" | "open" | "publish" | "tie-break";

const copy: Record<
  VotingRoundAction,
  {
    blockedDescription: string;
    blockedTitle: string;
    confirmLabel: string;
    description: string;
    intent: string;
    title: string;
  }
> = {
  open: {
    blockedDescription:
      "La votación se abre una vez, con todas las academias finalistas y sus dos banners.",
    blockedTitle: "No se puede abrir la votación",
    confirmLabel: "Abrir",
    description:
      "El público empieza a votar en /votar con los códigos QR. La votación toma las academias finalistas y sus banners como están ahora: lo que cambies después no la modifica.",
    intent: openVotingRoundIntent,
    title: "¿Abrir la votación?",
  },
  close: {
    blockedDescription: "Solo se cierra una votación abierta.",
    blockedTitle: "No se puede cerrar la votación",
    confirmLabel: "Cerrar",
    description:
      "Desde ese momento no se aceptan más votos. No se puede volver a abrir.",
    intent: closeVotingRoundIntent,
    title: "¿Cerrar la votación?",
  },
  "tie-break": {
    blockedDescription:
      "El desempate se abre una sola vez, cuando la votación cierra con empate en el primer puesto.",
    blockedTitle: "No se puede abrir el desempate",
    confirmLabel: "Abrir",
    description:
      "Se abre una segunda votación solo entre las academias empatadas en el primer puesto. Los códigos QR vigentes vuelven a servir y los votos de la primera votación se conservan.",
    intent: openTieBreakRoundIntent,
    title: "¿Abrir el desempate?",
  },
  publish: {
    blockedDescription:
      "El resultado se publica cuando la votación cerró sin empate en el primer puesto.",
    blockedTitle: "No se puede publicar el resultado",
    confirmLabel: "Publicar",
    description:
      "El ranking completo, con el porcentaje de cada academia, se muestra en /votar para todo el público.",
    intent: publishGrandFinalResultIntent,
    title: "¿Publicar el resultado?",
  },
  hide: {
    blockedDescription: "Solo se oculta un resultado publicado.",
    blockedTitle: "No se puede ocultar el resultado",
    confirmLabel: "Ocultar",
    description:
      "El ranking deja de verse en /votar. Podés volver a publicarlo cuando quieras.",
    intent: hideGrandFinalResultIntent,
    title: "¿Ocultar el resultado?",
  },
};

function readBlockReasons(
  action: VotingRoundAction | null,
  state: VotingRoundListState,
): VotingRoundBlockReason[] {
  if (!action) {
    return [];
  }

  const reasonsByAction: Record<VotingRoundAction, VotingRoundBlockReason[]> = {
    close: state.closeBlockReasons,
    hide: state.hideBlockReasons,
    open: state.openBlockReasons,
    publish: state.publishBlockReasons,
    "tie-break": state.tieBreakBlockReasons,
  };

  return reasonsByAction[action];
}

/**
 * Opening and closing the `votingRound`, opening its `Desempate`, and
 * publishing or hiding its result, from the list's `Acciones` menu.
 * Of open and close, and of publish and hide, the menu offers the one that
 * applies; an item it offers that the round's state still forbids opens every
 * reason instead of the confirmation, which closes on its confirming click. Both stay on the list; the answer is a toast.
 */
export function VotingRoundDialogs({
  action,
  onClose,
  state,
}: {
  action: VotingRoundAction | null;
  onClose: () => void;
  state: VotingRoundListState;
}) {
  const fetcher = useFetcher<GrandFinalListActionData>();
  const reasons = readBlockReasons(action, state);
  const text = action ? copy[action] : copy.open;

  useServerActionToast(fetcher.data);

  if (reasons.length > 0) {
    return (
      <BlockedActionDialog
        description={text.blockedDescription}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        open={action !== null}
        reasons={
          <ul className="list-disc pl-5">
            {reasons.map((reason) => (
              <li key={reason.code}>{reason.label}</li>
            ))}
          </ul>
        }
        reasonsTitle="Motivo"
        title={text.blockedTitle}
      />
    );
  }

  return (
    <ConfirmationDialog
      confirmLabel={text.confirmLabel}
      description={text.description}
      destructive={action === "close" || action === "hide"}
      onConfirm={() => {
        void fetcher.submit(
          action === "close"
            ? { intent: text.intent, roundId: state.roundId ?? "" }
            : { intent: text.intent },
          { method: "post" },
        );
      }}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={action !== null}
      title={text.title}
    />
  );
}

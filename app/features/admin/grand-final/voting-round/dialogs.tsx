import { useFetcher } from "react-router";

import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { GrandFinalListActionData } from "../list/shared";
import {
  closeVotingRoundIntent,
  openVotingRoundIntent,
  type VotingRoundListState,
} from "./shared";

export type VotingRoundAction = "close" | "open";

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
    confirmLabel: "Abrir votación",
    description:
      "El público empieza a votar en /votar con los códigos QR. La votación toma las academias finalistas y sus banners como están ahora: lo que cambies después no la modifica.",
    intent: openVotingRoundIntent,
    title: "¿Abrir la votación?",
  },
  close: {
    blockedDescription: "Solo se cierra una votación abierta.",
    blockedTitle: "No se puede cerrar la votación",
    confirmLabel: "Cerrar votación",
    description:
      "Desde ese momento no se aceptan más votos. No se puede volver a abrir.",
    intent: closeVotingRoundIntent,
    title: "¿Cerrar la votación?",
  },
};

/**
 * Opening and closing the `votingRound`, from the list's `Acciones` menu.
 * The menu item is always there: when the round's state forbids it, it opens
 * every reason instead of the confirmation, which closes on its confirming
 * click. Both stay on the list; the answer is a toast.
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
  const reasons =
    action === "open"
      ? state.openBlockReasons
      : action === "close"
        ? state.closeBlockReasons
        : [];
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
      destructive={action === "close"}
      onConfirm={() => {
        void fetcher.submit({ intent: text.intent }, { method: "post" });
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

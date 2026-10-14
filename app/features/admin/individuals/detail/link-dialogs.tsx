import { Form } from "react-router";

import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import {
  isRouteFormPending,
  useCloseOnceSettled,
  useOptionalNavigation,
} from "@/lib/shared/forms";

import {
  confirmedDocumentNumberField,
  confirmLinkIntent,
  revokeLinkIntent,
} from "./shared";

/** Which of the link's dialogs is open, if any. */
export type LinkDialog = "blocked" | "confirm" | "revoke" | null;

const linkFormId = "individual-link-form";

/**
 * `Confirmar vínculo` and `Revocar vínculo` behind their confirmation, or the
 * blocked dialog when there is no photo to confirm against.
 */
export function LinkDialogs({
  dialog,
  onClose,
  ...copy
}: LinkConfirmationCopy & {
  dialog: LinkDialog;
  onClose: () => void;
}) {
  const closeOnDismiss = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  switch (dialog) {
    case null:
      return null;
    case "blocked":
      return (
        <BlockedActionDialog
          open
          onOpenChange={closeOnDismiss}
          title="No se puede confirmar el vínculo"
          description="Se confirma comparando la foto del documento con los datos de la cuenta."
          reasonsTitle="Falta la foto del documento"
          reasons="El particular todavía no la subió desde Mis datos."
        />
      );
    case "confirm":
    case "revoke":
      return (
        <LinkConfirmationDialog
          {...copy}
          isRevoking={dialog === "revoke"}
          onClose={onClose}
        />
      );
  }
}

type LinkConfirmationCopy = {
  /** `DNI 30123456`, as the dialog names it. */
  documentLabel: string;
  /** The stored number, which the confirmation names. */
  documentNumber: string;
  fullName: string;
  reachedRowCount: number;
};

function LinkConfirmationDialog({
  isRevoking,
  onClose,
  ...copy
}: LinkConfirmationCopy & { isRevoking: boolean; onClose: () => void }) {
  const navigation = useOptionalNavigation();
  const intent = isRevoking ? revokeLinkIntent : confirmLinkIntent;
  const isPending = isRouteFormPending(navigation, { intent });

  useCloseOnceSettled({ isPending, onClose });

  return (
    <ConfirmationDialog
      confirmLabel={isRevoking ? "Revocar vínculo" : "Confirmar vínculo"}
      description={
        isRevoking
          ? `${copy.fullName} deja de ver su participación en las academias hasta que se vuelva a confirmar.`
          : describeConfirmation(copy)
      }
      destructive={isRevoking}
      form={linkFormId}
      isPending={isPending}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      title={isRevoking ? "¿Revocar el vínculo?" : "¿Confirmar el vínculo?"}
    >
      <Form id={linkFormId} method="post">
        <input type="hidden" name="intent" value={intent} />
        {isRevoking ? null : (
          <input
            type="hidden"
            name={confirmedDocumentNumberField}
            value={copy.documentNumber}
          />
        )}
      </Form>
    </ConfirmationDialog>
  );
}

function describeConfirmation({
  documentLabel,
  fullName,
  reachedRowCount,
}: LinkConfirmationCopy) {
  if (reachedRowCount === 0) {
    return `Ninguna academia cargó todavía a alguien con ${documentLabel}. ${fullName} va a ver su participación en cuanto una lo haga.`;
  }

  const rows =
    reachedRowCount === 1
      ? "la fila de academia"
      : `las ${reachedRowCount} filas de academia`;

  return `${fullName} va a ver su participación en ${rows} con ${documentLabel}, y en las que se carguen después con ese documento.`;
}

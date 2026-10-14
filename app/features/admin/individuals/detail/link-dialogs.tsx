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
  confirmedDocumentPhotoField,
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
  if (dialog === null) {
    return null;
  }

  if (dialog === "blocked") {
    return (
      <BlockedActionDialog
        open
        onOpenChange={(open) => closeWhenDismissed(open, onClose)}
        title="No se puede confirmar el vínculo"
        description="Se confirma comparando la foto del documento con los datos de la cuenta."
        reasonsTitle="Falta la foto del documento"
        reasons="El particular todavía no la subió desde Mis datos."
      />
    );
  }

  return (
    <LinkConfirmationDialog
      {...(dialog === "revoke" ? revokeDialog(copy) : confirmDialog(copy))}
      onClose={onClose}
    />
  );
}

type LinkConfirmationCopy = {
  /** `DNI 30123456`, as the dialog names it. */
  documentLabel: string;
  /** The stored number, which the confirmation names. */
  documentNumber: string;
  /** The photo on screen, which the confirmation names too. */
  documentPhotoStorageKey: string | null;
  fullName: string;
  reachedRowCount: number;
};

/** What one of the two confirmations says and posts. */
type LinkDialogContent = {
  confirmLabel: string;
  description: string;
  destructive: boolean;
  /** The hidden fields the action reads, `intent` included. */
  fields: Record<string, string>;
  intent: string;
  title: string;
};

function confirmDialog(copy: LinkConfirmationCopy): LinkDialogContent {
  return {
    confirmLabel: "Confirmar vínculo",
    description: describeConfirmation(copy),
    destructive: false,
    fields: {
      [confirmedDocumentNumberField]: copy.documentNumber,
      [confirmedDocumentPhotoField]: copy.documentPhotoStorageKey ?? "",
    },
    intent: confirmLinkIntent,
    title: "¿Confirmar el vínculo?",
  };
}

function revokeDialog(copy: LinkConfirmationCopy): LinkDialogContent {
  return {
    confirmLabel: "Revocar vínculo",
    description: `${copy.fullName} deja de ver su participación en las academias hasta que se vuelva a confirmar.`,
    destructive: true,
    fields: {},
    intent: revokeLinkIntent,
    title: "¿Revocar el vínculo?",
  };
}

function LinkConfirmationDialog({
  fields,
  intent,
  onClose,
  ...content
}: LinkDialogContent & { onClose: () => void }) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, { intent });

  useCloseOnceSettled({ isPending, onClose });

  return (
    <ConfirmationDialog
      {...content}
      form={linkFormId}
      isPending={isPending}
      onOpenChange={(open) => closeWhenDismissed(open, onClose)}
      open
    >
      <Form id={linkFormId} method="post">
        <input type="hidden" name="intent" value={intent} />
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      </Form>
    </ConfirmationDialog>
  );
}

function closeWhenDismissed(open: boolean, onClose: () => void) {
  if (!open) {
    onClose();
  }
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

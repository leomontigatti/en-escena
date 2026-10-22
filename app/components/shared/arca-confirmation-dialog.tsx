import type { LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useFetcher } from "react-router";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  type ComprobanteContingency,
  ContingencyAlert,
  type ContingencySubmitState,
  contingencyCancelLabel,
  resolveContingencySubmitState,
} from "@/lib/comprobantes/contingency-alert";
import { useServerActionToast } from "@/lib/shared/toasts";

/** What an action ARCA answers returns to the dialog that posted it. */
type ArcaConfirmationActionData =
  | { status: "error"; message: string }
  | { status: "warning"; contingency: ComprobanteContingency };

/**
 * The confirmation of an action ARCA authorizes, emitting a comprobante, as
 * an `AlertDialog` (ADR-0011): focus
 * trapped, no close on an outside click, `role="alertdialog"`. No checkbox:
 * the dialog is the confirmation, and `confirm` travels as the hidden
 * deliberate-submit keyword the server requires.
 *
 * Its request goes through a fetcher, so ARCA's refusal or contingency comes
 * back here and the dialog stays open on it; the happy path redirects, and the
 * fetcher follows it.
 */
export function ArcaConfirmationDialog({
  children,
  confirmIcon: ConfirmIcon,
  confirmLabel,
  confirmValue,
  description,
  destructive = false,
  intent,
  onOpenChange,
  open,
  recheckIntent,
  title,
  toastId,
}: {
  /** Shown under the description: what is about to be billed, say. */
  children?: ReactNode;
  confirmIcon: LucideIcon;
  /** The verb from the title: `Emitir` for `¿Emitir la Factura C?`. */
  confirmLabel: string;
  confirmValue: string;
  description: ReactNode;
  destructive?: boolean;
  intent: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** The intent that asks ARCA again about a comprobante in contingency. */
  recheckIntent: string;
  /** A question naming the action and its object. */
  title: string;
  toastId: string;
}) {
  const {
    acknowledge,
    acknowledged,
    contingency,
    fetcher,
    isSaving,
    submitState,
  } = useArcaConfirmation(toastId);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (isSaving) {
          return;
        }
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value={intent} />
          <input type="hidden" name="confirm" value={confirmValue} />

          {children}

          {contingency ? (
            <ContingencyAlert
              acknowledged={acknowledged}
              contingency={contingency}
              isBusy={isSaving}
              onAcknowledge={acknowledge}
              onRecheck={(payload) =>
                fetcher.submit(payload, { method: "post" })
              }
              recheckIntent={recheckIntent}
            />
          ) : null}

          <ArcaConfirmationFooter
            confirmIcon={ConfirmIcon}
            confirmLabel={confirmLabel}
            destructive={destructive}
            isSaving={isSaving}
            submitState={submitState}
          />
        </fetcher.Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The dialog's request and what ARCA answered it: the contingency it reported,
 * the operator's manual verification of it, and what that leaves the verb.
 */
function useArcaConfirmation(toastId: string) {
  const fetcher = useFetcher<ArcaConfirmationActionData>();
  const contingency =
    fetcher.data?.status === "warning" ? fetcher.data.contingency : null;

  // Manual verification is declared by the operator, so it cannot survive a new
  // attempt: every response from the server clears it and the retry goes back to
  // being blocked if it is still unresolved.
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    setAcknowledged(false);
  }, [fetcher.data]);

  useServerActionToast(fetcher.data?.status === "error" ? fetcher.data : null, {
    toastId,
  });

  return {
    acknowledge: () => setAcknowledged(true),
    acknowledged,
    contingency,
    fetcher,
    isSaving: fetcher.state !== "idle",
    submitState: resolveContingencySubmitState(contingency, acknowledged),
  };
}

function ArcaConfirmationFooter({
  confirmIcon: ConfirmIcon,
  confirmLabel,
  destructive,
  isSaving,
  submitState,
}: {
  confirmIcon: LucideIcon;
  confirmLabel: string;
  destructive: boolean;
  isSaving: boolean;
  submitState: ContingencySubmitState;
}) {
  return (
    <AlertDialogFooter>
      <AlertDialogCancel type="button" disabled={isSaving}>
        {contingencyCancelLabel(submitState)}
      </AlertDialogCancel>
      {/* Recovered: the comprobante is already authorized and on record, so
          the button is removed. Disabling it would read as "hold on" and
          would invite a retry that would emit a second one. */}
      {submitState === "removed" ? null : (
        <Button
          type="submit"
          variant={destructive ? "destructive" : "default"}
          disabled={isSaving || submitState === "blocked"}
        >
          {isSaving ? (
            <Spinner aria-hidden="true" data-icon="inline-start" />
          ) : (
            <ConfirmIcon aria-hidden="true" data-icon="inline-start" />
          )}
          {confirmLabel}
        </Button>
      )}
    </AlertDialogFooter>
  );
}

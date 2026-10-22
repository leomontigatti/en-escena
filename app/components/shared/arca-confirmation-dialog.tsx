import type { LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
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
import { createValidatedRouteFormDataSubmitHandler } from "@/lib/shared/forms";
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
export function ArcaConfirmationDialog<TFieldValues extends FieldValues>({
  abandonIntent,
  children,
  confirmIcon: ConfirmIcon,
  confirmLabel,
  confirmValue,
  description,
  destructive = false,
  form,
  intent,
  onOpenChange,
  open,
  recheckIntent,
  title,
  toastId,
}: {
  /** The intent that gives up a reservation left live. */
  abandonIntent: string;
  /** Shown under the description: what is about to be billed, say. */
  children?: ReactNode;
  confirmIcon: LucideIcon;
  /** The verb from the title: `Emitir` for `¿Emitir el comprobante?`. */
  confirmLabel: string;
  confirmValue: string;
  description: ReactNode;
  destructive?: boolean;
  /**
   * The form behind the fields `children` render, when the confirmation has
   * any: the submit then goes through its validation first.
   */
  form?: Pick<UseFormReturn<TFieldValues>, "handleSubmit">;
  intent: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** The intent that asks ARCA again about a comprobante in contingency. */
  recheckIntent: string;
  /** A question naming the action and its object. */
  title: string;
  toastId: string;
}) {
  const { contingency, fetcher, isSaving, submitState } =
    useArcaConfirmation(toastId);

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

        <fetcher.Form
          method="post"
          className="flex flex-col gap-4"
          onSubmit={
            form
              ? createValidatedRouteFormDataSubmitHandler(form, fetcher.submit)
              : undefined
          }
        >
          <input type="hidden" name="intent" value={intent} />
          <input type="hidden" name="confirm" value={confirmValue} />

          {children}

          {contingency ? (
            <ContingencyAlert
              abandonIntent={abandonIntent}
              contingency={contingency}
              isBusy={isSaving}
              onSubmit={(payload) =>
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
 * The dialog's request and what ARCA answered it: the contingency it reported
 * and what that leaves the verb.
 */
function useArcaConfirmation(toastId: string) {
  const fetcher = useFetcher<ArcaConfirmationActionData>();
  // The last contingency ARCA reported stands until ARCA reports another: an
  // error answer is a toast about this request, not news about the attempt, so
  // a re-check turned away as busy leaves the live attempt's alert and block.
  const [contingency, setContingency] = useState<ComprobanteContingency | null>(
    null,
  );
  useEffect(() => {
    if (fetcher.data?.status === "warning") {
      setContingency(fetcher.data.contingency);
    }
  }, [fetcher.data]);

  useServerActionToast(fetcher.data?.status === "error" ? fetcher.data : null, {
    toastId,
  });

  return {
    contingency,
    fetcher,
    isSaving: fetcher.state !== "idle",
    submitState: resolveContingencySubmitState(contingency),
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

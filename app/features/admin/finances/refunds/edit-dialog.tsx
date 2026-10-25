import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, useFormState } from "react-hook-form";
import { useFetcher } from "react-router";

import { SubmitButton } from "@/components/shared/action-buttons";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { DateOnlyField } from "@/components/shared/date-only-field";
import {
  DiscardChangesDialog,
  useDiscardGuard,
} from "@/components/shared/discard-guard";
import { IrreversibleActionAlert } from "@/components/shared/irreversible-action-alert";
import { MoneyInputField } from "@/components/shared/integer-input-field";
import { SelectField } from "@/components/shared/select-field";
import { TextareaField } from "@/components/shared/textarea-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatAmount } from "@/lib/finances/formatters";
import {
  paymentMethodOptions,
  type PaymentMethod,
} from "@/lib/finances/payment-methods";
import {
  createValidatedReactRouterSubmitHandler,
  useCloseOnceSettled,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  deleteRefundIntent,
  updateRefundIntent,
  updateRefundSchema,
  type RefundActionData,
  type UpdateRefundFormValues,
} from "./shared";

/** The refund a row opens: what the dialog shows and the version it edits. */
export type EditableRefund = {
  amount: number;
  date: string;
  id: string;
  internalNote: string | null;
  method: PaymentMethod;
  number: number;
  reference: string | null;
  /** Its `updatedAt` when read; a correction made against another is refused. */
  version: string;
};

/**
 * Edits or deletes a `Reembolso` from its row: a refund has no page of its
 * own, and every list that shows one opens this dialog. Academy and event are
 * not fields: the refund keeps them. A raise is capped at the `Saldo
 * disponible` plus the refund's own amount, which the dialog states and
 * checks; the server checks it again under the pool lock, and refuses a
 * correction over a refund someone changed meanwhile. A refusal is a toast and
 * the form keeps its values; a success closes the dialog over the revalidated
 * list (docs/agents/form-feedback.md).
 */
export function EditRefundDialog({
  availableBalanceAmount,
  onOpenChange,
  refund,
}: {
  availableBalanceAmount: number;
  onOpenChange: (open: boolean) => void;
  refund: EditableRefund;
}) {
  const fetcher = useFetcher<RefundActionData>();
  const isSaving = fetcher.state !== "idle";
  const isDeleting =
    isSaving && fetcher.formData?.get("intent") === deleteRefundIntent;
  const [isConfirmingDeletion, setIsConfirmingDeletion] = useState(false);
  const capAmount = availableBalanceAmount + refund.amount;
  const schema = useMemo(
    () =>
      updateRefundSchema.refine(
        (values) => Number(values.amount) <= capAmount,
        {
          message: `El reembolso no puede superar ${formatAmount(capAmount)}, el saldo disponible más su monto actual.`,
          path: ["amount"],
        },
      ),
    [capAmount],
  );
  const savedValues = useMemo<UpdateRefundFormValues>(
    () => ({
      intent: updateRefundIntent,
      refundId: refund.id,
      version: refund.version,
      refundDate: refund.date,
      amount: String(refund.amount),
      refundMethod: refund.method,
      reference: refund.reference ?? "",
      internalNote: refund.internalNote ?? "",
    }),
    [
      refund.amount,
      refund.date,
      refund.id,
      refund.internalNote,
      refund.method,
      refund.reference,
      refund.version,
    ],
  );
  const form = useForm<UpdateRefundFormValues>({
    defaultValues: savedValues,
    mode: "onSubmit",
    resolver: zodResolver(schema),
  });
  const { isDirty } = useFormState({ control: form.control });

  // A refund someone else corrected while this dialog was open is refused
  // once; the revalidated row then brings their version, which the form shows
  // and edits from.
  useEffect(() => {
    form.reset(savedValues);
  }, [form, savedValues]);

  useServerActionToast(fetcher.data);

  const isDone = fetcher.data?.status === "success";
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const closeConfirmation = useCallback(
    () => setIsConfirmingDeletion(false),
    [],
  );

  useEffect(() => {
    if (isDone) {
      close();
    }
  }, [close, isDone]);
  useCloseOnceSettled({ isPending: isDeleting, onClose: closeConfirmation });

  const { discardDialogProps, requestClose } = useDiscardGuard({
    isAudioDirty: false,
    isFormDirty: isDirty,
    onClose: close,
  });
  const refundLabel = `Reembolso # ${formatEventSequenceNumber(refund.number)}`;

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next && !isSaving) {
            requestClose();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{refundLabel}</DialogTitle>
            <DialogDescription>
              Corregí el reembolso o eliminalo si se registró por error.
            </DialogDescription>
          </DialogHeader>
          <form
            method="post"
            noValidate
            onSubmit={createValidatedReactRouterSubmitHandler(
              form,
              fetcher.submit,
              { method: "post" },
            )}
            className="flex flex-col gap-4"
          >
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <DateOnlyField
                control={form.control}
                id="edit-refund-date"
                label="Fecha del reembolso"
                name="refundDate"
              />
              <TextInputField
                control={form.control}
                id="edit-refund-reference"
                label="Referencia"
                name="reference"
              />
              <MoneyInputField
                control={form.control}
                description={`Hasta ${formatAmount(capAmount)}, el saldo disponible más su monto actual.`}
                id="edit-refund-amount"
                label="Monto"
                min="1"
                name="amount"
                step="1"
              />
              <SelectField
                control={form.control}
                id="edit-refund-method"
                label="Medio"
                name="refundMethod"
                options={paymentMethodOptions}
                placeholder="Seleccioná un medio"
              />
              <TextareaField
                className="sm:col-span-2"
                control={form.control}
                id="edit-refund-internal-note"
                label="Nota interna"
                name="internalNote"
              />
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="destructive"
                className="sm:mr-auto"
                disabled={isSaving}
                onClick={() => setIsConfirmingDeletion(true)}
              >
                <Trash2 aria-hidden="true" data-icon="inline-start" />
                Eliminar
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={requestClose}
              >
                Cancelar
              </Button>
              <SubmitButton
                disabled={!isDirty}
                isPending={isSaving && !isDeleting}
              />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        confirmIcon={Trash2}
        confirmLabel="Eliminar"
        description={`Esta acción elimina el ${refundLabel.toLowerCase()} y devuelve ${formatAmount(refund.amount)} al saldo disponible.`}
        destructive
        isPending={isDeleting}
        onConfirm={() => {
          void fetcher.submit(
            {
              intent: deleteRefundIntent,
              refundId: refund.id,
              version: refund.version,
            },
            { method: "post" },
          );
        }}
        onOpenChange={setIsConfirmingDeletion}
        open={isConfirmingDeletion}
        title="¿Eliminar el reembolso?"
      >
        <IrreversibleActionAlert />
      </ConfirmationDialog>
      <DiscardChangesDialog {...discardDialogProps} />
    </>
  );
}

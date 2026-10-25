import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo } from "react";
import { useForm, useFormState } from "react-hook-form";
import { useFetcher } from "react-router";

import { DateOnlyField } from "@/components/shared/date-only-field";
import {
  DiscardChangesDialog,
  useDiscardGuard,
} from "@/components/shared/discard-guard";
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
import { Spinner } from "@/components/ui/spinner";
import { formatAmount } from "@/lib/finances/formatters";
import { paymentMethodOptions } from "@/lib/finances/payment-methods";
import { createValidatedReactRouterSubmitHandler } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  defaultRegisterRefundValues,
  futureRefundDateMessage,
  isRefundDateNotFuture,
  registerRefundSchema,
  type RefundActionData,
  type RegisterRefundFormValues,
} from "./shared";

/**
 * Registers a `Reembolso` from the owner's `Movimientos` tab. The most it can
 * hand back is the owner's `Saldo disponible`, which the dialog states and
 * checks before posting; the server checks it again against the live balance,
 * for a pool that moved after the dialog opened. A refusal is a toast and the
 * form keeps its values; a success closes the dialog over the revalidated tab
 * (docs/agents/form-feedback.md).
 */
export function RegisterRefundDialog({
  availableBalanceAmount,
  onOpenChange,
}: {
  availableBalanceAmount: number;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<RefundActionData>();
  const isSaving = fetcher.state !== "idle";
  const schema = useMemo(
    () =>
      registerRefundSchema
        .refine((values) => Number(values.amount) <= availableBalanceAmount, {
          message: `El reembolso no puede superar el saldo disponible de ${formatAmount(availableBalanceAmount)}.`,
          path: ["amount"],
        })
        .refine(isRefundDateNotFuture, {
          message: futureRefundDateMessage,
          path: ["refundDate"],
        }),
    [availableBalanceAmount],
  );
  const form = useForm<RegisterRefundFormValues>({
    defaultValues: defaultRegisterRefundValues(),
    mode: "onSubmit",
    resolver: zodResolver(schema),
  });
  const { isDirty } = useFormState({ control: form.control });

  useServerActionToast(fetcher.data);

  const isDone = fetcher.data?.status === "success";
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (isDone) {
      close();
    }
  }, [close, isDone]);

  const { discardDialogProps, requestClose } = useDiscardGuard({
    isAudioDirty: false,
    isFormDirty: isDirty,
    onClose: close,
  });

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
            <DialogTitle>Registrar reembolso</DialogTitle>
            <DialogDescription>
              Sale del saldo disponible para el evento activo y no cambia
              ninguna inscripción.
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
                id="refund-date"
                label="Fecha del reembolso"
                name="refundDate"
              />
              <TextInputField
                control={form.control}
                id="refund-reference"
                label="Referencia"
                name="reference"
              />
              <MoneyInputField
                control={form.control}
                description={`Hasta ${formatAmount(availableBalanceAmount)}, el saldo disponible.`}
                id="refund-amount"
                label="Monto"
                min="1"
                name="amount"
                step="1"
              />
              <SelectField
                control={form.control}
                id="refund-method"
                label="Medio"
                name="refundMethod"
                options={paymentMethodOptions}
                placeholder="Seleccioná un medio"
              />
              <TextareaField
                className="sm:col-span-2"
                control={form.control}
                id="refund-internal-note"
                label="Nota interna"
                name="internalNote"
              />
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={requestClose}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!isDirty || isSaving}>
                {isSaving ? (
                  <Spinner aria-hidden="true" data-icon="inline-start" />
                ) : null}
                Registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog {...discardDialogProps} />
    </>
  );
}

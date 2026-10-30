import { z } from "zod";

import { registerPaymentSchema } from "@/features/admin/finances/academy-choreographies/shared";
import { isDateOnly, isFutureDateOnly } from "@/lib/shared/date-only";

export const updateRefundIntent = "update-refund";
export const deleteRefundIntent = "delete-refund";

/**
 * A refund's fields: a payment's, with its own date. The amount, the method
 * (over the payment methods) and the two free texts read as a payment's do.
 * No academy or event: the refund keeps its own. The date is read here; that it
 * is not after today is the write module's rule, which the edit dialog checks
 * early (`isRefundDateNotFuture`).
 */
const refundFieldsSchema = z.object({
  refundDate: z
    .string()
    .trim()
    .superRefine((value, context) => {
      if (!value) {
        context.addIssue({
          code: "custom",
          message: "Este campo es obligatorio.",
        });
        return;
      }

      if (!isDateOnly(value)) {
        context.addIssue({
          code: "custom",
          message: "Ingresá una fecha válida.",
        });
      }
    }),
  amount: registerPaymentSchema.shape.amount,
  refundMethod: registerPaymentSchema.shape.paymentMethod,
  reference: registerPaymentSchema.shape.reference,
  internalNote: registerPaymentSchema.shape.internalNote,
});

export const futureRefundDateMessage =
  "La fecha del reembolso no puede ser futura.";

/**
 * The edit dialog's early answer to a date after today, so it shows on the field
 * before anything posts; the write module refuses it again on save.
 */
export function isRefundDateNotFuture(values: { refundDate: string }) {
  return !isFutureDateOnly(values.refundDate);
}

/**
 * An edit names the refund and the version it was made against
 * (`refunds.server.ts`), so a refund that changed meanwhile is refused.
 */
export const updateRefundSchema = refundFieldsSchema.extend({
  intent: z.literal(updateRefundIntent),
  refundId: z.string().min(1),
  version: z.string().min(1),
});

export type UpdateRefundFormValues = z.input<typeof updateRefundSchema>;

function readRefundFieldValues(formData: FormData) {
  return {
    refundDate: String(formData.get("refundDate") ?? "").trim(),
    amount: String(formData.get("amount") ?? "").trim(),
    refundMethod: String(formData.get("refundMethod") ?? "").trim(),
    reference: String(formData.get("reference") ?? "").trim(),
    internalNote: String(formData.get("internalNote") ?? "").trim(),
  };
}

export function readUpdateRefundValues(
  formData: FormData,
): UpdateRefundFormValues {
  return {
    intent: updateRefundIntent,
    ...readRefundFieldValues(formData),
    refundId: String(formData.get("refundId") ?? ""),
    version: String(formData.get("version") ?? ""),
  };
}

export type RefundActionData = {
  intent: typeof deleteRefundIntent | typeof updateRefundIntent;
  message: string;
  status: "error" | "success";
};

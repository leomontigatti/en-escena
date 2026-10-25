import { z } from "zod";

import { registerPaymentSchema } from "@/features/admin/finances/academy-choreographies/shared";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";
import { isDateOnly, isFutureDateOnly } from "@/lib/shared/date-only";

export const registerRefundIntent = "register-refund";
export const updateRefundIntent = "update-refund";
export const deleteRefundIntent = "delete-refund";

/**
 * A refund's fields: a payment's, with its own date. The amount, the method
 * (over the payment methods) and the two free texts read as a payment's do.
 * Registering and editing share them; neither carries an academy or an event,
 * which the page (on register) and the refund itself (on edit) fix.
 */
const refundFieldsSchema = z.object({
  refundDate: z
    .string()
    .trim()
    .superRefine((value, context) => {
      if (!value) {
        context.addIssue({
          code: "custom",
          message: "Ingresá la fecha del reembolso.",
        });
        return;
      }

      if (!isDateOnly(value)) {
        context.addIssue({
          code: "custom",
          message: "Ingresá una fecha válida.",
        });
        return;
      }

      if (isFutureDateOnly(value)) {
        context.addIssue({
          code: "custom",
          message: "La fecha del reembolso no puede ser futura.",
        });
      }
    }),
  amount: registerPaymentSchema.shape.amount,
  refundMethod: registerPaymentSchema.shape.paymentMethod,
  reference: registerPaymentSchema.shape.reference,
  internalNote: registerPaymentSchema.shape.internalNote,
});

export const registerRefundSchema = refundFieldsSchema.extend({
  intent: z.literal(registerRefundIntent),
});

/**
 * An edit names the refund and the version it was made against
 * (`refunds.server.ts`), so a refund that changed meanwhile is refused.
 */
export const updateRefundSchema = refundFieldsSchema.extend({
  intent: z.literal(updateRefundIntent),
  refundId: z.string().min(1),
  version: z.string().min(1),
});

export type RegisterRefundFormValues = z.input<typeof registerRefundSchema>;
export type UpdateRefundFormValues = z.input<typeof updateRefundSchema>;

export function defaultRegisterRefundValues(): RegisterRefundFormValues {
  return {
    intent: registerRefundIntent,
    refundDate: getBusinessDateOnly(),
    amount: "",
    refundMethod: "transferencia",
    reference: "",
    internalNote: "",
  };
}

function readRefundFieldValues(formData: FormData) {
  return {
    refundDate: String(formData.get("refundDate") ?? "").trim(),
    amount: String(formData.get("amount") ?? "").trim(),
    refundMethod: String(formData.get("refundMethod") ?? "").trim(),
    reference: String(formData.get("reference") ?? "").trim(),
    internalNote: String(formData.get("internalNote") ?? "").trim(),
  };
}

export function readRegisterRefundValues(
  formData: FormData,
): RegisterRefundFormValues {
  return { intent: registerRefundIntent, ...readRefundFieldValues(formData) };
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
  intent:
    | typeof deleteRefundIntent
    | typeof registerRefundIntent
    | typeof updateRefundIntent;
  message: string;
  status: "error" | "success";
};

import { z } from "zod";

import { registerPaymentSchema } from "@/features/admin/finances/academy-choreographies/shared";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";
import { isDateOnly, isFutureDateOnly } from "@/lib/shared/date-only";

export const registerRefundIntent = "register-refund";

/**
 * A refund's form: a payment's, with its own date. The amount, the method
 * (over the payment methods) and the two free texts read as a payment's do.
 */
export const registerRefundSchema = z.object({
  intent: z.literal(registerRefundIntent),
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

export type RegisterRefundFormValues = z.input<typeof registerRefundSchema>;

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

export function readRegisterRefundValues(
  formData: FormData,
): RegisterRefundFormValues {
  return {
    intent: registerRefundIntent,
    refundDate: String(formData.get("refundDate") ?? "").trim(),
    amount: String(formData.get("amount") ?? "").trim(),
    refundMethod: String(formData.get("refundMethod") ?? "").trim(),
    reference: String(formData.get("reference") ?? "").trim(),
    internalNote: String(formData.get("internalNote") ?? "").trim(),
  };
}

export type RefundActionData = {
  intent: typeof registerRefundIntent;
  message: string;
  status: "error" | "success";
};

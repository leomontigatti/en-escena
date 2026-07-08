import { z } from "zod";

import {
  isDateOnly,
  isFutureDateOnly,
  todayDateOnly,
} from "@/lib/shared/date-only";
import { paymentMethodValues } from "@/lib/finances/payment-methods";

export { paymentMethodOptions } from "@/lib/finances/payment-methods";

export const paymentFieldNames = [
  "paymentDate",
  "amount",
  "paymentMethod",
  "reference",
  "internalNote",
] as const;
export const balanceInvoiceFieldNames = [
  "choreographyId",
  "issueDate",
  "administrativeDiscountAmount",
  "administrativeDiscountInternalReason",
  "administrativeDiscountPublicLabel",
] as const;
export const imputationFieldNames = [
  "paymentId",
  "invoiceId",
  "imputationDate",
  "amount",
] as const;
export const correctionFieldNames = [
  "paymentId",
  "invoiceId",
  "imputationId",
  "reason",
] as const;

export type PaymentFieldName = (typeof paymentFieldNames)[number];
export type BalanceInvoiceFieldName = (typeof balanceInvoiceFieldNames)[number];
export type ImputationFieldName = (typeof imputationFieldNames)[number];
export type CorrectionFieldName = (typeof correctionFieldNames)[number];

export type PaymentImputationFormValues = {
  amount: string;
  imputationDate: string;
  invoiceId: string;
  paymentId: string;
};

export type BalanceInvoiceFormValues = {
  administrativeDiscountAmount: string;
  administrativeDiscountInternalReason: string;
  administrativeDiscountPublicLabel: string;
  choreographyId: string;
  issueDate: string;
};

export type AccountCurrentCorrectionFormValues = {
  imputationId: string;
  invoiceId: string;
  paymentId: string;
  reason: string;
};

export const registerPaymentSchema = z.object({
  paymentDate: z
    .string()
    .trim()
    .superRefine((value, context) => {
      if (!value) {
        context.addIssue({
          code: "custom",
          message: "Ingresá la fecha de pago.",
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
          message: "La fecha de pago no puede ser futura.",
        });
      }
    }),
  amount: z
    .string()
    .trim()
    .refine((value) => /^\d+$/.test(value), {
      message: "Ingresá un monto entero en pesos, sin centavos.",
    })
    .refine((value) => Number(value) > 0, {
      message: "Ingresá un monto mayor a cero.",
    }),
  paymentMethod: z
    .string()
    .trim()
    .pipe(
      z.enum(paymentMethodValues, {
        message: "Seleccioná un medio de pago.",
      }),
    ),
  reference: z.string().trim(),
  internalNote: z.string().trim(),
});

export type RegisterPaymentFormValues = z.input<typeof registerPaymentSchema>;
export type RegisterPaymentSubmissionValues = z.output<
  typeof registerPaymentSchema
>;

export const paymentImputationSchema = z.object({
  paymentId: z.string().trim().min(1, {
    message: "Seleccioná un Pago.",
  }),
  invoiceId: z.string().trim().min(1, {
    message: "Seleccioná una factura.",
  }),
  imputationDate: z
    .string()
    .trim()
    .superRefine((value, context) => {
      if (!value) {
        context.addIssue({
          code: "custom",
          message: "Ingresá la fecha de imputación.",
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
          message: "La fecha de imputación no puede ser futura.",
        });
      }
    }),
  amount: z
    .string()
    .trim()
    .refine((value) => /^\d+$/.test(value), {
      message: "Ingresá un monto entero en pesos, sin centavos.",
    })
    .refine((value) => Number(value) > 0, {
      message: "Ingresá un monto mayor a cero.",
    }),
});

export const balanceInvoiceSchema = z.object({
  choreographyId: z.string().trim().min(1, {
    message: "Seleccioná una Coreografía.",
  }),
  issueDate: z
    .string()
    .trim()
    .superRefine((value, context) => {
      if (!value) {
        context.addIssue({
          code: "custom",
          message: "Ingresá la fecha de emisión.",
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
          message: "La fecha de emisión no puede ser futura.",
        });
      }
    }),
  administrativeDiscountAmount: z
    .string()
    .trim()
    .refine((value) => /^\d+$/.test(value), {
      message:
        "Ingresá un descuento administrativo entero en pesos, sin centavos.",
    }),
  administrativeDiscountInternalReason: z.string().trim(),
  administrativeDiscountPublicLabel: z.string().trim(),
});

export type BalanceInvoicePreviewData = {
  administrativeDiscountAmount: number;
  appliedDepositAmount: number;
  balanceAmount: number;
  basePriceAmount: number;
  choreographyId: string;
  choreographyName: string;
  dancerDiscountAmount: number;
  depositCompletedOn: string;
  finalTotalAmount: number;
  issueDate: string;
  totalDiscountAmount: number;
};

const correctionReasonSchema = z.string().trim().min(1, {
  message: "Ingresá un motivo para registrar esta corrección.",
});

export const annulImputationSchema = z.object({
  imputationId: z.string().trim().min(1, {
    message: "Seleccioná una imputación.",
  }),
  reason: correctionReasonSchema,
});

export const cancelInvoiceSchema = z.object({
  invoiceId: z.string().trim().min(1, {
    message: "Seleccioná una factura.",
  }),
  reason: correctionReasonSchema,
});

export const annulPaymentSchema = z.object({
  paymentId: z.string().trim().min(1, {
    message: "Seleccioná un Pago.",
  }),
  reason: correctionReasonSchema,
});

export type AdministrativeAcademyAccountCurrentActionData =
  | {
      fieldErrors: Partial<
        Record<
          | PaymentFieldName
          | BalanceInvoiceFieldName
          | ImputationFieldName
          | CorrectionFieldName,
          string
        >
      >;
      message: string;
      status: "error";
      values: {
        balanceInvoice: BalanceInvoiceFormValues;
        correction: AccountCurrentCorrectionFormValues;
        imputation: PaymentImputationFormValues;
        payment: RegisterPaymentFormValues;
      };
    }
  | {
      preview: BalanceInvoicePreviewData;
      status: "preview";
      values: {
        balanceInvoice: BalanceInvoiceFormValues;
        correction: AccountCurrentCorrectionFormValues;
        imputation: PaymentImputationFormValues;
        payment: RegisterPaymentFormValues;
      };
    };

export function defaultRegisterPaymentValues(): RegisterPaymentFormValues {
  return {
    paymentDate: todayDateOnly(),
    amount: "",
    paymentMethod: "transferencia",
    reference: "",
    internalNote: "",
  };
}

export function defaultPaymentImputationValues(): PaymentImputationFormValues {
  return {
    amount: "",
    imputationDate: todayDateOnly(),
    invoiceId: "",
    paymentId: "",
  };
}

function defaultBalanceInvoiceValues(): BalanceInvoiceFormValues {
  return {
    administrativeDiscountAmount: "0",
    administrativeDiscountInternalReason: "",
    administrativeDiscountPublicLabel: "",
    choreographyId: "",
    issueDate: todayDateOnly(),
  };
}

export function defaultAccountCurrentCorrectionValues(): AccountCurrentCorrectionFormValues {
  return {
    imputationId: "",
    invoiceId: "",
    paymentId: "",
    reason: "",
  };
}

export function defaultAccountCurrentActionValues(): AdministrativeAcademyAccountCurrentActionData["values"] {
  return {
    balanceInvoice: defaultBalanceInvoiceValues(),
    correction: defaultAccountCurrentCorrectionValues(),
    imputation: defaultPaymentImputationValues(),
    payment: defaultRegisterPaymentValues(),
  };
}

export function readRegisterPaymentValues(
  formData: FormData,
): RegisterPaymentFormValues {
  return {
    paymentDate: String(formData.get("paymentDate") ?? "").trim(),
    amount: String(formData.get("amount") ?? "").trim(),
    paymentMethod: String(formData.get("paymentMethod") ?? "").trim(),
    reference: String(formData.get("reference") ?? "").trim(),
    internalNote: String(formData.get("internalNote") ?? "").trim(),
  };
}

export function readPaymentImputationValues(
  formData: FormData,
): PaymentImputationFormValues {
  return {
    amount: String(formData.get("amount") ?? "").trim(),
    imputationDate: String(formData.get("imputationDate") ?? "").trim(),
    invoiceId: String(formData.get("invoiceId") ?? "").trim(),
    paymentId: String(formData.get("paymentId") ?? "").trim(),
  };
}

export function readBalanceInvoiceValues(
  formData: FormData,
): BalanceInvoiceFormValues {
  return {
    administrativeDiscountAmount: String(
      formData.get("administrativeDiscountAmount") ?? "",
    ).trim(),
    administrativeDiscountInternalReason: String(
      formData.get("administrativeDiscountInternalReason") ?? "",
    ).trim(),
    administrativeDiscountPublicLabel: String(
      formData.get("administrativeDiscountPublicLabel") ?? "",
    ).trim(),
    choreographyId: String(formData.get("choreographyId") ?? "").trim(),
    issueDate: String(formData.get("issueDate") ?? "").trim(),
  };
}

export function readAccountCurrentCorrectionValues(
  formData: FormData,
): AccountCurrentCorrectionFormValues {
  return {
    imputationId: String(formData.get("imputationId") ?? "").trim(),
    invoiceId: String(formData.get("invoiceId") ?? "").trim(),
    paymentId: String(formData.get("paymentId") ?? "").trim(),
    reason: String(formData.get("reason") ?? "").trim(),
  };
}

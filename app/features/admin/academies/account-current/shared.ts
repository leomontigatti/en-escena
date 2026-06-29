import { z } from "zod";

import {
  isDateOnly,
  isFutureDateOnly,
  todayDateOnly,
} from "@/lib/shared/date-only";

const paymentMethodValues = [
  "transferencia",
  "efectivo",
  "mercado_pago",
  "otro",
] as const;

type PaymentMethod = (typeof paymentMethodValues)[number];

export const paymentMethodOptions = [
  { label: "Transferencia", value: "transferencia" },
  { label: "Efectivo", value: "efectivo" },
  { label: "Mercado Pago", value: "mercado_pago" },
  { label: "Otro", value: "otro" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: PaymentMethod;
}>;

export const paymentFieldNames = [
  "paymentDate",
  "amount",
  "paymentMethod",
  "reference",
  "internalNote",
] as const;
export const invoiceFieldNames = ["issueDate", "choreographyIds"] as const;

export type PaymentFieldName = (typeof paymentFieldNames)[number];
export type InvoiceFieldName = (typeof invoiceFieldNames)[number];

export type RegisterPaymentFormValues = {
  amount: string;
  internalNote: string;
  paymentDate: string;
  paymentMethod: string;
  reference: string;
};

export type IssueDepositInvoicesFormValues = {
  choreographyIds: string[];
  issueDate: string;
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
  paymentMethod: z.enum(paymentMethodValues, {
    message: "Seleccioná un medio de pago.",
  }),
  reference: z.string().trim(),
  internalNote: z.string().trim(),
});

export const issueDepositInvoicesSchema = z.object({
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
  choreographyIds: z
    .array(z.string().trim().min(1))
    .refine((value) => value.length > 0, {
      message: "Seleccioná al menos una Coreografía.",
    }),
});

export type AdministrativeAcademyAccountCurrentActionData = {
  fieldErrors: Partial<Record<PaymentFieldName | InvoiceFieldName, string>>;
  message: string;
  status: "error";
  values: {
    invoice: IssueDepositInvoicesFormValues;
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

export function defaultIssueDepositInvoicesValues(): IssueDepositInvoicesFormValues {
  return {
    choreographyIds: [],
    issueDate: todayDateOnly(),
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

export function readIssueDepositInvoicesValues(
  formData: FormData,
): IssueDepositInvoicesFormValues {
  return {
    choreographyIds: formData
      .getAll("choreographyIds")
      .flatMap((value) =>
        typeof value === "string" && value.trim().length > 0
          ? [value.trim()]
          : [],
      ),
    issueDate: String(formData.get("issueDate") ?? "").trim(),
  };
}

export function formatPaymentMethodLabel(value: PaymentMethod) {
  return (
    paymentMethodOptions.find((option) => option.value === value)?.label ??
    value
  );
}

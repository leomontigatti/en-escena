import { z } from "zod";

export const paymentMethodOptions = [
  { label: "Transferencia", value: "transferencia" },
  { label: "Efectivo", value: "efectivo" },
  { label: "Mercado Pago", value: "mercado_pago" },
  { label: "Otro", value: "otro" },
] as const;

export const paymentFieldNames = [
  "paymentDate",
  "amount",
  "paymentMethod",
  "reference",
  "internalNote",
] as const;

export type PaymentFieldName = (typeof paymentFieldNames)[number];

export type RegisterPaymentFormValues = {
  amount: string;
  internalNote: string;
  paymentDate: string;
  paymentMethod: string;
  reference: string;
};

export const registerPaymentSchema = z.object({
  paymentDate: z
    .string()
    .trim()
    .min(1, "Ingresá la fecha de pago.")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresá una fecha válida.")
    .refine((value) => value <= todayDateOnly(), {
      message: "La fecha de pago no puede ser futura.",
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
    .refine(
      (value) => paymentMethodOptions.some((option) => option.value === value),
      "Seleccioná un medio de pago.",
    ),
  reference: z.string().trim(),
  internalNote: z.string().trim(),
});

export type AdministrativeAcademyAccountCurrentActionData = {
  fieldErrors: Partial<Record<PaymentFieldName, string>>;
  message: string;
  status: "error";
  values: RegisterPaymentFormValues;
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

export function formatPaymentMethodLabel(
  value: (typeof paymentMethodOptions)[number]["value"],
) {
  return (
    paymentMethodOptions.find((option) => option.value === value)?.label ??
    value
  );
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

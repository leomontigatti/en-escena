export const paymentMethodValues = [
  "transferencia",
  "efectivo",
  "mercado_pago",
  "otro",
] as const;

export type PaymentMethod = (typeof paymentMethodValues)[number];

export const paymentMethodOptions = [
  { label: "Transferencia", value: "transferencia" },
  { label: "Efectivo", value: "efectivo" },
  { label: "Mercado Pago", value: "mercado_pago" },
  { label: "Otro", value: "otro" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: PaymentMethod;
}>;

export const paymentMethodBadgeVariants = {
  transferencia: "info",
  efectivo: "success",
  mercado_pago: "warning",
  otro: "outline",
} as const satisfies Record<PaymentMethod, string>;

export function getPaymentMethodBadgeVariant(value: PaymentMethod) {
  return paymentMethodBadgeVariants[value] ?? "secondary";
}

export function formatPaymentMethodLabel(value: PaymentMethod) {
  return (
    paymentMethodOptions.find((option) => option.value === value)?.label ??
    value
  );
}

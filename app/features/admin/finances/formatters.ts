import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";

const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const paymentDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatAmount(amount: number) {
  return moneyFormatter.format(amount).replace(/\u00a0/g, " ");
}

export function formatOperationalAmount(amount: OperationalFinanceAmount) {
  if (amount.status === "incomplete") {
    return "Pendiente";
  }

  return formatAmount(amount.amount);
}

export function formatDate(value: string) {
  return paymentDateFormatter.format(new Date(`${value}T00:00:00Z`));
}

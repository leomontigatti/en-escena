export function formatInvoiceState(status: "parcial" | "pagada" | "pendiente") {
  switch (status) {
    case "pendiente":
      return "Pendiente";
    case "parcial":
      return "Parcial";
    case "pagada":
      return "Pagada";
  }
}

export function formatChoreographyFinancialState(
  status: "impaga" | "pagada" | "señada",
) {
  switch (status) {
    case "impaga":
      return "Impaga";
    case "señada":
      return "Señada";
    case "pagada":
      return "Pagada";
  }
}

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

export function formatDate(value: string) {
  return paymentDateFormatter.format(new Date(`${value}T00:00:00Z`));
}

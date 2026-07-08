import { isDateOnly, isFutureDateOnly } from "@/lib/shared/date-only";

export function validateInvoiceIssueDate(issueDate: string) {
  if (!issueDate) {
    return "Ingresá la fecha de emisión.";
  }

  if (!isDateOnly(issueDate)) {
    return "Ingresá una fecha válida.";
  }

  if (isFutureDateOnly(issueDate)) {
    return "La fecha de emisión no puede ser futura.";
  }

  return null;
}

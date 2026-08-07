import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

export function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return parsed.toISOString().slice(0, 10) === value;
}

// "Hoy" tiene un solo dueño: `getBusinessDateOnly()`. El servidor corre en UTC,
// así que resolverlo acá con `new Date()` adelantaría el día a partir de las 21
// de Córdoba.
export function isFutureDateOnly(value: string) {
  return value > getBusinessDateOnly();
}

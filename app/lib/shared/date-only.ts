import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

export function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return parsed.toISOString().slice(0, 10) === value;
}

// "Today" has a single owner: `getBusinessDateOnly()`. The server runs in UTC, so
// resolving it here with `new Date()` would advance the day from 21:00 Córdoba
// time onwards.
export function isFutureDateOnly(value: string) {
  return value > getBusinessDateOnly();
}

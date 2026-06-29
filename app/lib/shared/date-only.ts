export function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

export function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return parsed.toISOString().slice(0, 10) === value;
}

export function isFutureDateOnly(value: string) {
  return value > todayDateOnly();
}

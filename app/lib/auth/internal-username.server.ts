const INTERNAL_USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function normalizeInternalUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isValidInternalUsername(value: string) {
  const normalized = normalizeInternalUsername(value);

  return (
    INTERNAL_USERNAME_PATTERN.test(normalized) && !normalized.includes("@")
  );
}

export function assertValidInternalUsername(value: string) {
  if (!isValidInternalUsername(value)) {
    throw new Error("Nombre de usuario interno inválido.");
  }

  return normalizeInternalUsername(value);
}

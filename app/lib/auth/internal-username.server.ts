// Real routed addresses on `enescena.com.ar`: an internal username becomes a
// credential email on that domain, and `acceso@` is the outbound sender.
// See docs/operations/dns-and-email.md.
const RESERVED_INTERNAL_USERNAMES = new Set(["acceso", "dmarc"]);

const INTERNAL_USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function normalizeInternalUsername(value: string) {
  return value.trim().toLowerCase();
}

function isValidInternalUsername(value: string) {
  const normalized = normalizeInternalUsername(value);

  return (
    INTERNAL_USERNAME_PATTERN.test(normalized) && !normalized.includes("@")
  );
}

export function assertValidInternalUsername(value: string) {
  if (!isValidInternalUsername(value)) {
    throw new Error("Invalid internal username.");
  }

  return normalizeInternalUsername(value);
}

export function isReservedInternalUsername(value: string) {
  return RESERVED_INTERNAL_USERNAMES.has(normalizeInternalUsername(value));
}

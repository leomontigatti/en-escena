import { normalizeInternalUsername } from "@/lib/auth/internal-username.shared";

// Real routed addresses on `enescena.com.ar`: an internal username becomes a
// credential email on that domain, and `acceso@` is the outbound sender.
// See docs/operations/dns-and-email.md.
const RESERVED_INTERNAL_USERNAMES = new Set(["acceso", "dmarc"]);

export { normalizeInternalUsername };

export function isReservedInternalUsername(value: string) {
  return RESERVED_INTERNAL_USERNAMES.has(normalizeInternalUsername(value));
}

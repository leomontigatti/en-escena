// Internal users have no email: Better Auth keys the password on a unique
// `user.email`, so the username makes one up once, at creation, and nobody
// types it or sees it. Nothing is ever sent to it.
// See docs/domain/access.md.
const internalCredentialEmailDomain = "enescena.com.ar";

export function buildInternalCredentialEmail(internalUsername: string) {
  return `${internalUsername}@${internalCredentialEmailDomain}`;
}

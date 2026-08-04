const internalCredentialEmailDomain = "usuarios-internos.enescena.local";

export function buildInternalCredentialEmail(internalUsername: string) {
  return `${internalUsername}@${internalCredentialEmailDomain}`;
}

export function isInternalCredentialEmail(email: string) {
  return email.endsWith(`@${internalCredentialEmailDomain}`);
}

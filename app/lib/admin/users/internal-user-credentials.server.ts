const INTERNAL_CREDENTIAL_EMAIL_DOMAIN = "usuarios-internos.enescena.local";

export function buildInternalCredentialEmail(internalUsername: string) {
  return `${internalUsername}@${INTERNAL_CREDENTIAL_EMAIL_DOMAIN}`;
}

export function getInternalOptionalEmail(input: {
  email: string;
  internalUsername: string;
}) {
  return input.email === buildInternalCredentialEmail(input.internalUsername)
    ? null
    : input.email;
}

export function isInternalCredentialEmail(email: string) {
  return email.endsWith(`@${INTERNAL_CREDENTIAL_EMAIL_DOMAIN}`);
}

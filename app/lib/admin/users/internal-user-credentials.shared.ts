const internalCredentialEmailDomain = "usuarios-internos.enescena.local";

export function buildInternalCredentialEmail(internalUsername: string) {
  return `${internalUsername}@${internalCredentialEmailDomain}`;
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
  return email.endsWith(`@${internalCredentialEmailDomain}`);
}

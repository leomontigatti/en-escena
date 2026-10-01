// The shape of a `Nombre de usuario interno`, checked by the create form in
// the browser and by the server with the same rule and the same message.
const INTERNAL_USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export const internalUsernameRuleMessage =
  "Usá entre 3 y 32 caracteres: minúsculas, números, punto, guion o guion bajo.";

export function normalizeInternalUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isValidInternalUsername(value: string) {
  return INTERNAL_USERNAME_PATTERN.test(normalizeInternalUsername(value));
}

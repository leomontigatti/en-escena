export const choreographyNameMaxLength = 120;
export const invalidChoreographyNameMessage =
  "Ingresá un nombre válido para la coreografía.";

export function collapseChoreographyNameWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function hasChoreographyNameContent(value: string) {
  return /[\p{L}\p{N}]/u.test(value);
}

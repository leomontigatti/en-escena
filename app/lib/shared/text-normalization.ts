export function toTitleCase(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .replace(/\S+/gu, (word) =>
      word.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase("es")),
    );
}

/** The comparison key for a stored name: case-folded and whitespace-collapsed. */
export function normalizeForComparison(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("es");
}

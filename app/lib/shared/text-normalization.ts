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

/** `a`, `b` y `c` — the Spanish enumeration a sentence reads as a list. */
export function formatSpanishList(items: readonly string[]) {
  if (items.length <= 1) {
    return items.join("");
  }

  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

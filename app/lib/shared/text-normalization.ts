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

/**
 * `3 bailarines`, `1 bailarín`, or nothing for zero: the count a summary line
 * leaves out when there is nothing to count. The sentence adds its own period.
 */
export function pluralize(total: number, singular: string, plural: string) {
  if (total === 0) {
    return null;
  }

  return `${total} ${total === 1 ? singular : plural}`;
}

const spanishParticles = new Set(["de", "del", "la", "las", "los", "y"]);

/**
 * A person's name as Spanish writes it: each word capitalised, each part of a
 * hyphenated word too, and the particles (`de`, `del`, `la`, `las`, `los`, `y`)
 * lowercase after the first word, so `juan DE LA cruz` is `Juan de la Cruz`.
 * Names that are not a person's keep `toTitleCase`.
 */
export function toPersonName(value: string) {
  return normalizeSpanishTitleCase(value, { lowercaseLeadingParticle: false });
}

/** `toPersonName` for a surname, which may open with a particle: `de la Cruz`. */
export function toPersonLastName(value: string) {
  return normalizeSpanishTitleCase(value, { lowercaseLeadingParticle: true });
}

function normalizeSpanishTitleCase(
  value: string,
  options: { lowercaseLeadingParticle: boolean },
) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word, index) => normalizeSpanishTitleCaseWord(word, index, options))
    .join(" ");
}

function normalizeSpanishTitleCaseWord(
  word: string,
  index: number,
  options: { lowercaseLeadingParticle: boolean },
) {
  const lowerWord = word.toLocaleLowerCase("es-AR");

  if (
    spanishParticles.has(lowerWord) &&
    (index > 0 || options.lowercaseLeadingParticle)
  ) {
    return lowerWord;
  }

  return lowerWord
    .split("-")
    .map((part) => capitalizeFirstCharacter(part))
    .join("-");
}

function capitalizeFirstCharacter(value: string) {
  const [firstCharacter, ...rest] = Array.from(value);

  if (!firstCharacter) {
    return value;
  }

  return `${firstCharacter.toLocaleUpperCase("es-AR")}${rest.join("")}`;
}

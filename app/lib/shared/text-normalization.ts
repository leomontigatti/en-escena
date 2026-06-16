export function toTitleCase(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .replace(/\S+/gu, (word) =>
      word.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase("es")),
    );
}

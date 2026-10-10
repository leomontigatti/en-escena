/**
 * Which half of the `Gran final` requirement a category counts towards
 * (`grandFinalGroup` in `CONTEXT.md`), read off the first word of its name.
 * The rule is fixed in code for this event: nothing configures it, no screen
 * shows it, and ages are never read.
 */
export type GrandFinalGroup = "children" | "adults";

const groupByFirstWord: ReadonlyMap<string, GrandFinalGroup> = new Map([
  ["baby", "children"],
  ["infantil", "children"],
  ["juvenil", "adults"],
  ["mayores", "adults"],
  ["adulto", "adults"],
  ["adultos", "adults"],
]);

/** `null` when the category counts for neither half. */
export function grandFinalGroup(categoryName: string): GrandFinalGroup | null {
  const [firstWord = ""] = categoryName.trim().split(/\s+/);

  return groupByFirstWord.get(firstWord.toLowerCase()) ?? null;
}

/**
 * Whether a choreography's presentation has already been evaluated, which is
 * the one condition that closes a choreography for correction. It replaces the
 * old "has a presentation" lock: a number is only a place in the order and can
 * be moved, so it locks nothing; what cannot be undone is a judge having
 * scored the presentation. See docs/domain/choreographies.md, "Choreography
 * Locks".
 *
 * There are no scores yet — the judging effort owns that table — so both
 * functions answer "not evaluated" for every choreography. They exist now so
 * that every lock site already reads the final seam and the judging effort has
 * a single body to fill.
 */

export async function hasEvaluatedPresentation(
  _choreographyId: string,
): Promise<boolean> {
  return false;
}

/**
 * The bulk form, for readers that hold many choreographies at once — the
 * birth-date correction sweeps every choreography a dancer belongs to — and
 * must not ask the seam once per row.
 */
export async function findEvaluatedChoreographyIds(
  _choreographyIds: string[],
): Promise<Set<string>> {
  return new Set();
}

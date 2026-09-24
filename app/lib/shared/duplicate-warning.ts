/**
 * The one mechanism every duplicate guard that only warns shares: the action
 * answers with the records it found, the form shows them and re-submits the
 * same values carrying their ids, and the server warns again when a match the
 * ids do not cover appeared meanwhile. Nothing is stored about it.
 */
export const acknowledgedDuplicateIdsField = "acknowledgedDuplicateIds";

export type DuplicateWarning<
  Kind extends string,
  Match extends { id: string },
> = {
  kind: Kind;
  matches: Match[];
};

export function readAcknowledgedDuplicateIds(formData: FormData) {
  return formData
    .getAll(acknowledgedDuplicateIdsField)
    .filter((value) => typeof value === "string" && value.length > 0)
    .map(String);
}

/**
 * The matches the warning has to carry, or none when the user already saw them
 * all. A match found for the first time re-opens the warning, and the answer
 * then carries *every* match — the ones already acknowledged included — so the
 * next submit covers the whole set. Returning only the new one would drop the
 * acknowledgement of the others, and two matches appearing in turn would warn
 * about each other forever.
 */
export function matchesToWarnAbout<Match extends { id: string }>(
  matches: readonly Match[],
  acknowledgedIds: readonly string[],
): Match[] {
  const acknowledged = new Set(acknowledgedIds);
  const hasNewMatch = matches.some((match) => !acknowledged.has(match.id));

  return hasNewMatch ? [...matches] : [];
}

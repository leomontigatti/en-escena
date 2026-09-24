/**
 * The one mechanism every duplicate guard that only warns shares: the action
 * answers with the records it found, the form shows them and re-submits the
 * same values carrying their ids, and the server skips only those ids — so a
 * match that appeared meanwhile warns again. Nothing is stored about it.
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

export function filterUnacknowledgedMatches<Match extends { id: string }>(
  matches: readonly Match[],
  acknowledgedIds: readonly string[],
) {
  const acknowledged = new Set(acknowledgedIds);

  return matches.filter((match) => !acknowledged.has(match.id));
}

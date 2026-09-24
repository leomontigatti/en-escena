import type { DuplicateWarning } from "@/lib/shared/duplicate-warning";
import { formatSpanishList } from "@/lib/shared/text-normalization";

/** Everything the wizard needs to name a piece the academy already registered. */
export type ChoreographyCastMatch = {
  choreographyNumber: number;
  id: string;
  name: string;
};

export type ChoreographyCastWarning = DuplicateWarning<
  "choreography-cast",
  ChoreographyCastMatch
>;

/**
 * Same name and same cast is a re-entry often enough to warn about, and a
 * legitimate registration often enough never to refuse: two solos of different
 * dancers share a piece name all the time, so the match names what it found and
 * the academy decides.
 */
export function getDuplicateChoreographyMessage(
  matches: readonly ChoreographyCastMatch[],
) {
  const labels = matches.map(
    (match) => `«${match.name}» (N.º ${match.choreographyNumber})`,
  );

  return `Ya registraste ${formatSpanishList(labels)} con los mismos bailarines en este evento.`;
}

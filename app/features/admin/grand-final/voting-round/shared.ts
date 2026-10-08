/**
 * What the `Gran final` list's voting round actions and their server agree
 * on. A module of its own because the view imports it and the server module
 * cannot reach the browser.
 */

export const openVotingRoundIntent = "open-voting-round";
export const closeVotingRoundIntent = "close-voting-round";

/**
 * Why `Abrir votación` or `Cerrar votación` cannot run, built by the server,
 * which owns the rule. The menu item stays and opens them
 * (docs/agents/form-feedback.md).
 */
export type VotingRoundBlockReason = {
  code:
    | "already-closed"
    | "already-open"
    | "missing-banners"
    | "no-finalists"
    | "not-open";
  label: string;
};

export type VotingRoundListState = {
  closeBlockReasons: VotingRoundBlockReason[];
  openBlockReasons: VotingRoundBlockReason[];
  /** `null` before the round opens. */
  status: "closed" | "open" | null;
};

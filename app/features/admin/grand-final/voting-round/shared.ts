import type {
  GrandFinalOutcome,
  RankedFinalist,
} from "@/lib/grand-final/ranking";

/**
 * What the `Gran final` list's voting round actions and their server agree
 * on. A module of its own because the view imports it and the server module
 * cannot reach the browser.
 */

export const openVotingRoundIntent = "open-voting-round";
export const closeVotingRoundIntent = "close-voting-round";
export const openTieBreakRoundIntent = "open-tie-break-round";
export const publishGrandFinalResultIntent = "publish-grand-final-result";
export const hideGrandFinalResultIntent = "hide-grand-final-result";

/**
 * Why a round action cannot run, built by the server, which owns the rule.
 * The menu item stays and opens them (docs/agents/form-feedback.md).
 */
export type VotingRoundBlockReason = {
  code:
    | "already-closed"
    | "already-open"
    | "already-published"
    | "already-tie-break"
    | "missing-banners"
    | "no-finalists"
    | "no-round"
    | "no-tie"
    | "not-open"
    | "not-published"
    | "round-open"
    | "tie-pending";
  label: string;
};

/**
 * The last round's result once it closed: the ranking, how it ended, and
 * whether it is public.
 */
export type VotingRoundResultView = {
  entries: RankedFinalist[];
  outcome: GrandFinalOutcome;
  published: boolean;
  roundNumber: number;
  /** A `Desempate` tied on points that the QR votes decided. */
  tieBrokenByCodeVotes: boolean;
};

export type VotingRoundListState = {
  closeBlockReasons: VotingRoundBlockReason[];
  hideBlockReasons: VotingRoundBlockReason[];
  openBlockReasons: VotingRoundBlockReason[];
  publishBlockReasons: VotingRoundBlockReason[];
  /** `null` while no round closed: nothing reveals totals while one is open. */
  result: VotingRoundResultView | null;
  /**
   * The current round, which `Cerrar votación` names: a close confirmed over
   * round 1 never closes the `Desempate` opened meanwhile. `null` before the
   * first round opens.
   */
  roundId: string | null;
  /** `null` before the round opens. */
  status: "closed" | "open" | null;
  tieBreakBlockReasons: VotingRoundBlockReason[];
};

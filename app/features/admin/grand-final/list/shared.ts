import type { GrandFinalPicks } from "@/lib/grand-final/picks-overview.server";

import type {
  AuditLinkCreateBlockReason,
  AuditLinkListRow,
  AuditLinkHandoverData,
} from "../audit-links/shared";
import type { VoteCodeBatchListRow } from "../vote-codes/shared";
import type { VotingRoundListState } from "../voting-round/shared";

/**
 * What administration's `Gran final` list and its server agree on. A module of
 * its own because the view imports these types, and the server module cannot
 * reach the browser.
 */

export type GrandFinalListActionData = {
  /** The live `auditLink` its dialog hands over, just created or shown again. */
  auditLink?: AuditLinkHandoverData;
  message: string;
  status: "error" | "success";
};

export type GrandFinalListResult = {
  auditLinkCreateBlockReasons: AuditLinkCreateBlockReason[];
  auditLinks: AuditLinkListRow[];
  picks: GrandFinalPicks | null;
  selectedEventId: string | null;
  voteCodeBatches: VoteCodeBatchListRow[];
  /** `null` without an active event. */
  votingRound: VotingRoundListState | null;
};

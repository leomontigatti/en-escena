// How the posted review hands back to a human — spec §4.4, amended 2026-09-17
// (issue #1021).
//
// Review never merges and never approves, so its last act is to say which kind
// of hand-off this is. `agent:ready` means the review left nothing to decide —
// merge it, or arm auto-merge. `agent:needs-decision` means a call is a human's
// and is the cue to run `/review-triage`. Exactly one of the two lands on the PR.
//
// The classification is deliberately asymmetric: `agent:ready` is the label that
// lets a PR through, so it is only reached when both inputs are known *and* both
// say there is nothing left. Anything unreadable falls to `agent:needs-decision`,
// whose cost is one triage pass rather than a merged unaddressed finding.

export const READY_LABEL = "agent:ready";
export const NEEDS_DECISION_LABEL = "agent:needs-decision";

export type ReviewOutcomeLabel = typeof READY_LABEL | typeof NEEDS_DECISION_LABEL;

/** Both labels, so a caller can remove the one it is not applying. */
export const REVIEW_OUTCOME_LABELS: readonly ReviewOutcomeLabel[] = [READY_LABEL, NEEDS_DECISION_LABEL];

/** Where the runner leaves the agent's spec-finding flag for the labelling step. */
export const SPEC_FINDINGS_FILE = "spec_findings.txt";

export interface ReviewOutcome {
  /**
   * Inline threads still unresolved on the PR once the review is posted —
   * the ones this review just opened plus any human thread it could not settle
   * (it cannot resolve threads). `null` when the count could not be read.
   */
  readonly unresolvedThreads: number | null;
  /**
   * Whether the summary reports a spec finding, which the reviewer is told to
   * raise rather than fix. `null` when the agent didn't say.
   */
  readonly specFindings: boolean | null;
}

/** The single outcome label for a posted review. */
export function reviewOutcomeLabel(outcome: ReviewOutcome): ReviewOutcomeLabel {
  const nothingLeft = outcome.unresolvedThreads === 0 && outcome.specFindings === false;
  return nothingLeft ? READY_LABEL : NEEDS_DECISION_LABEL;
}

/** A non-negative integer count, or `null` for anything else. */
export function parseUnresolvedThreads(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  return Number.parseInt(text, 10);
}

/** `"true"` / `"false"`, or `null` for anything else. */
export function parseSpecFindings(raw: string): boolean | null {
  const text = raw.trim().toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  return null;
}

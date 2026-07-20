// Shared `gh` wrapper for the AFK runners' read-only context prefetch (issue #384).
//
// The runners hold no GitHub token and only *read* context (issue bodies, PR
// comments, review threads) before invoking the agent. Those reads are
// idempotent, so a transient GitHub blip (a 503, a secondary rate limit, a
// dropped connection) should be retried rather than crash the runner and turn
// an infra hiccup into an `agent:blocked` PR that needs a human to unstick.
//
// Only *transient* failures are retried, with exponential backoff + full jitter
// and a hard cap on attempts (which also bounds total wall time). Non-transient
// errors (4xx permission/validation) fail fast, exactly as a bare `gh` call
// would. Mutations are the orchestrator's job and never flow through here.

import { execFileSync } from "node:child_process";

/**
 * Signals in a `gh`/network error that mark it safely retryable. Matched
 * against the error's message *and* its captured stderr — `gh` writes "HTTP
 * 503" and friends to stderr, not to the thrown `Error.message`.
 */
const TRANSIENT_PATTERNS: readonly RegExp[] = [
  /No server is currently available/i,
  /\bHTTP (?:500|502|503|504)\b/,
  /secondary rate limit/i,
  /\b(?:ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|EPIPE)\b/,
  /\b(?:timed out|timeout)\b/i,
];

/** Flatten every text-bearing field of a thrown error into one searchable blob. */
function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as {
      message?: unknown;
      stderr?: unknown;
      stdout?: unknown;
      code?: unknown;
    };
    return [e.message, e.stderr, e.stdout, e.code]
      .map((part) => (part == null ? "" : String(part)))
      .join("\n");
  }
  return String(error);
}

/** True when a failed `gh` read is a transient infra blip worth retrying. */
export function isTransientGhError(error: unknown): boolean {
  const text = errorText(error);
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(text));
}

export interface GhRetryConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export interface GhRetryDeps extends GhRetryConfig {
  /** Runs the actual `gh` call; injected so tests never spawn a process. */
  readonly run: (args: string[]) => string;
  /** Blocks for `ms`; injected so tests never actually wait. */
  readonly sleep: (ms: number) => void;
  /** Jitter source in `[0, 1)`; injected so tests are deterministic. */
  readonly random: () => number;
}

export const DEFAULT_GH_RETRY: GhRetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
};

/** Exponential backoff with full jitter, capped at `maxDelayMs`. */
export function backoffDelayMs(
  attempt: number,
  config: GhRetryConfig,
  random: () => number,
): number {
  const exponential = config.baseDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(config.maxDelayMs, exponential);
  return Math.round(random() * capped);
}

/**
 * Run a `gh` read, retrying only transient failures with backoff. Non-transient
 * errors and the final attempt's error propagate unchanged.
 */
export function ghWithRetry(args: string[], deps: GhRetryDeps): string {
  for (let attempt = 1; ; attempt++) {
    try {
      return deps.run(args);
    } catch (error) {
      const isLastAttempt = attempt >= deps.maxAttempts;
      if (isLastAttempt || !isTransientGhError(error)) {
        throw error;
      }
      deps.sleep(backoffDelayMs(attempt, deps, deps.random));
    }
  }
}

function runGh(args: string[]): string {
  return execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Block the synchronous runner for `ms` without a busy-loop. */
function sleepSync(ms: number): void {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * The `gh` helper the runners call for read-only context prefetch. Drop-in for
 * a bare `gh api …` / `gh pr view …`, but resilient to transient GitHub blips.
 */
export function gh(args: string[]): string {
  return ghWithRetry(args, {
    ...DEFAULT_GH_RETRY,
    run: runGh,
    sleep: sleepSync,
    random: Math.random,
  });
}

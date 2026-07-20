import { describe, expect, it, vi } from "vitest";

// Regression coverage for #384: the runners' read-only context prefetch used a
// bare `gh` call, so a transient GitHub blip (a 503, a secondary rate limit, a
// dropped connection) during prefetch crashed the runner and turned an infra
// hiccup into an `agent:blocked` PR. The shared `gh` helper now retries only
// *transient* failures with backoff, while permission/validation errors keep
// failing fast.
import {
  backoffDelayMs,
  DEFAULT_GH_RETRY,
  ghWithRetry,
  isTransientGhError,
  type GhRetryDeps,
} from "../../.sandcastle/lib/gh.mjs";

/** An error shaped like what `execFileSync("gh", …)` throws (stderr carries the HTTP status). */
function ghError(stderr: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error("Command failed: gh api …"), {
    stderr,
    ...extra,
  });
}

function deps(
  overrides: Partial<GhRetryDeps> & Pick<GhRetryDeps, "run">,
): GhRetryDeps {
  return {
    ...DEFAULT_GH_RETRY,
    sleep: () => {},
    random: () => 0,
    ...overrides,
  };
}

describe("isTransientGhError", () => {
  it("treats GitHub 5xx blips as transient", () => {
    // The exact stderr that blocked PR #381 in the smoke test.
    const the503 = ghError(
      "gh: No server is currently available to service your request. (HTTP 503)",
    );
    expect(isTransientGhError(the503)).toBe(true);
    expect(isTransientGhError(ghError("gh: something broke (HTTP 502)"))).toBe(
      true,
    );
    expect(isTransientGhError(ghError("gh: server error (HTTP 500)"))).toBe(
      true,
    );
  });

  it("treats secondary rate limits and network errors as transient", () => {
    expect(
      isTransientGhError(ghError("You have exceeded a secondary rate limit.")),
    ).toBe(true);
    expect(isTransientGhError(ghError("", { code: "ETIMEDOUT" }))).toBe(true);
    expect(isTransientGhError(ghError("read ECONNRESET"))).toBe(true);
  });

  it("does not retry permission/validation errors", () => {
    expect(isTransientGhError(ghError("gh: Not Found (HTTP 404)"))).toBe(false);
    expect(
      isTransientGhError(
        ghError("gh: Resource not accessible by integration (HTTP 403)"),
      ),
    ).toBe(false);
    expect(
      isTransientGhError(ghError("gh: Validation Failed (HTTP 422)")),
    ).toBe(false);
  });

  it("classifies from stderr/code, not the echoed command line", () => {
    // `execFileSync` sets Error.message to "Command failed: <full argv>", so a
    // jq/graphql arg carrying transient-looking words must NOT make a genuinely
    // non-transient failure (this 404) look retryable.
    const misleadingMessage = Object.assign(
      new Error(
        'Command failed: gh api repos/x/issues --jq [.[]|select(.title|contains("timeout"))]',
      ),
      { stderr: "gh: Not Found (HTTP 404)", status: 1 },
    );
    expect(isTransientGhError(misleadingMessage)).toBe(false);
  });

  it("does not retry a missing `gh` binary (spawn ENOENT)", () => {
    const enoent = Object.assign(new Error("spawn gh ENOENT"), {
      code: "ENOENT",
    });
    expect(isTransientGhError(enoent)).toBe(false);
  });
});

describe("ghWithRetry", () => {
  it("retries a transient failure and returns the eventual success", () => {
    const run = vi
      .fn<(args: string[]) => string>()
      .mockImplementationOnce(() => {
        throw ghError("gh: No server is currently available (HTTP 503)");
      })
      .mockImplementationOnce(() => {
        throw ghError("gh: bad gateway (HTTP 502)");
      })
      .mockImplementationOnce(() => "ok");
    const sleep = vi.fn();

    const result = ghWithRetry(
      ["api", "repos/x/pulls/1/reviews"],
      deps({ run, sleep }),
    );

    expect(result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("fails fast on a non-transient error without retrying", () => {
    const run = vi.fn<(args: string[]) => string>().mockImplementation(() => {
      throw ghError("gh: Not Found (HTTP 404)");
    });
    const sleep = vi.fn();

    let thrown: unknown;
    try {
      ghWithRetry(["api", "repos/x/issues/9"], deps({ run, sleep }));
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { stderr?: string })?.stderr).toContain("HTTP 404");
    expect(run).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after maxAttempts and rethrows the last transient error", () => {
    const run = vi.fn<(args: string[]) => string>().mockImplementation(() => {
      throw ghError("gh: No server is currently available (HTTP 503)");
    });
    const sleep = vi.fn();

    let thrown: unknown;
    try {
      ghWithRetry(["api", "graphql"], deps({ run, sleep, maxAttempts: 3 }));
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { stderr?: string })?.stderr).toContain("HTTP 503");
    expect(run).toHaveBeenCalledTimes(3);
    // One sleep between each of the 3 attempts, but none after the last.
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});

describe("backoffDelayMs", () => {
  it("grows exponentially and caps at maxDelayMs (full jitter at random=1)", () => {
    const config = { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 8_000 };
    const full = () => 1;
    expect(backoffDelayMs(1, config, full)).toBe(500);
    expect(backoffDelayMs(2, config, full)).toBe(1_000);
    expect(backoffDelayMs(3, config, full)).toBe(2_000);
    expect(backoffDelayMs(4, config, full)).toBe(4_000);
    expect(backoffDelayMs(5, config, full)).toBe(8_000);
    // Capped: the raw exponential (16000) exceeds the ceiling.
    expect(backoffDelayMs(6, config, full)).toBe(8_000);
  });

  it("applies jitter within [0, capped]", () => {
    const config = { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 8_000 };
    expect(backoffDelayMs(3, config, () => 0)).toBe(0);
    expect(backoffDelayMs(3, config, () => 0.5)).toBe(1_000);
  });
});

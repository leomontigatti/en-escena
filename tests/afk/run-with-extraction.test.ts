import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { AgentTurn } from "../../.github/architecture-review/agent.mjs";
import { runWithExtraction } from "../../.github/architecture-review/run-with-extraction.mjs";
import { StructuredOutputError } from "../../.github/architecture-review/structured-output.mjs";

const schema = z.object({
  status: z.literal("skipped"),
  reason: z.string().min(1),
});

type RunTurn = (
  prompt: string,
  resumeSession: string | undefined,
) => Promise<AgentTurn>;

/** A `runTurn` that answers each call with the next scripted turn. */
function scriptedTurns(...turns: AgentTurn[]) {
  const runTurn = vi.fn<RunTurn>();
  for (const turn of turns) runTurn.mockResolvedValueOnce(turn);
  return runTurn;
}

function run(runTurn: RunTurn, maxAttempts?: number) {
  return runWithExtraction({
    prompt: "explore",
    extractionPrompt: "emit the output",
    tag: "output",
    schema,
    maxAttempts,
    runTurn,
  });
}

describe("runWithExtraction", () => {
  it("resumes the produce session for the extract pass and returns its validated output", async () => {
    const runTurn = scriptedTurns(
      { sessionId: "produce", text: "Explored." },
      {
        sessionId: "produce",
        text: 'Here it is.\n<output>\n```json\n{ "status": "skipped", "reason": "covered" }\n```\n</output>',
      },
    );

    await expect(run(runTurn)).resolves.toEqual({
      status: "skipped",
      reason: "covered",
    });
    expect(runTurn.mock.calls).toEqual([
      ["explore", undefined],
      ["emit the output", "produce"],
    ]);
  });

  it("resumes the failed extract turn with the validation failure as feedback", async () => {
    const runTurn = scriptedTurns(
      { sessionId: "produce", text: "Explored." },
      {
        sessionId: "extract-1",
        text: '<output>{ "status": "skipped", "reason": "" }</output>',
      },
      {
        sessionId: "extract-2",
        text: '<output>{ "status": "skipped", "reason": "covered" }</output>',
      },
    );

    await expect(run(runTurn)).resolves.toEqual({
      status: "skipped",
      reason: "covered",
    });
    const [feedback, resumed] = runTurn.mock.calls[2];
    expect(resumed).toBe("extract-1");
    expect(feedback).toContain("now on attempt 2 of 3");
    expect(feedback).toContain("- reason:");
  });

  it("gives up after maxAttempts with the last validation failure", async () => {
    const runTurn = scriptedTurns(
      { sessionId: "produce", text: "Explored." },
      { sessionId: "extract-1", text: "No block." },
      { sessionId: "extract-2", text: "Still no block." },
    );

    const failure = run(runTurn, 2);

    await expect(failure).rejects.toBeInstanceOf(StructuredOutputError);
    await expect(failure).rejects.toMatchObject({
      rawMatched: undefined,
      sessionId: "extract-2",
    });
    expect(runTurn).toHaveBeenCalledTimes(3);
  });

  it("fails before the extract pass when the produce turn reported no session", async () => {
    const runTurn = scriptedTurns({ sessionId: undefined, text: "Explored." });

    await expect(run(runTurn)).rejects.toThrow(/no session id/);
    expect(runTurn).toHaveBeenCalledTimes(1);
  });
});

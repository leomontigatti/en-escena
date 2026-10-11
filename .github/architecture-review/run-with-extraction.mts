// Two-pass produce/extract run (spec §3.8, "produce vs. extract").
//
// Asking one turn to both do the work and emit rigid JSON is brittle: a
// malformed blob would throw the whole exploration away. So:
//
//   1. Produce: run the work prompt with no output schema.
//   2. Extract: resume that session with a separate "emit <output> now, change
//      nothing" prompt, and validate what comes back. A validation failure
//      resumes the failed turn with feedback, up to `maxAttempts`.

import type { z } from "zod";

import type { AgentTurn } from "./agent.mjs";
import { buildRetryFeedback } from "./retry-feedback.mjs";
import {
  extractStructuredOutput,
  StructuredOutputError,
} from "./structured-output.mjs";

export interface RunWithExtractionOptions<T> {
  /** The work prompt for the produce pass. */
  readonly prompt: string;
  /** The "emit <output> now, change nothing" instruction for the extract pass. */
  readonly extractionPrompt: string;
  /** The tag the structured output is wrapped in. */
  readonly tag: string;
  readonly schema: z.ZodType<T>;
  /** Extract-pass attempts before giving up (default 3). */
  readonly maxAttempts?: number;
  /** Runs one agent turn, resuming a session when given one. */
  readonly runTurn: (
    prompt: string,
    resumeSession: string | undefined,
  ) => Promise<AgentTurn>;
}

export async function runWithExtraction<T>(
  options: RunWithExtractionOptions<T>,
): Promise<T> {
  const {
    prompt,
    extractionPrompt,
    tag,
    schema,
    maxAttempts = 3,
    runTurn,
  } = options;

  const produce = await runTurn(prompt, undefined);
  if (!produce.sessionId) {
    throw new Error(
      "runWithExtraction: the produce pass reported no session id, so the extract pass cannot resume it.",
    );
  }

  let session = produce.sessionId;
  let nextPrompt = extractionPrompt;
  let lastError: StructuredOutputError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const extract = await runTurn(nextPrompt, session);
    try {
      return extractStructuredOutput(
        extract.text,
        tag,
        schema,
        extract.sessionId,
      );
    } catch (error) {
      if (!(error instanceof StructuredOutputError)) throw error;
      lastError = error;
      session = error.sessionId ?? session;
      nextPrompt = buildRetryFeedback(error, attempt + 1, maxAttempts);
    }
  }

  throw lastError;
}

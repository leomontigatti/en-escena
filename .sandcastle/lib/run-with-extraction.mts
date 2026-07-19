// Two-pass produce/extract runner (spec §3.8, "produce vs. extract").
//
// For tasks with side effects we must NOT repeat (commits, comments): asking one
// LLM turn to both do the work and emit rigid JSON is brittle — a malformed blob
// would abort the whole run, including its side effects. So:
//
//   1. Produce: run the work prompt with NO output schema, so a bad emit can't
//      abort the side effects (commits). The RunResult exposes `.resume()`.
//   2. Extract: resume that session with a separate "emit <output> now, change
//      nothing" prompt + the schema, retried like `runWithRetry`.
//
// Commits come from the produce pass; the structured output from the extract pass.

import {
  run,
  StructuredOutputError,
  type AgentProvider,
  type OutputObjectDefinition,
  type RunOptions,
  type RunResult,
} from "@ai-hero/sandcastle";

import { buildRetryFeedback } from "../retry-feedback.mjs";

export interface RunWithExtractionOptions<T, A extends AgentProvider>
  extends Omit<RunOptions<A>, "output"> {
  /** Schema attached during the extract pass only. */
  readonly output: OutputObjectDefinition<T>;
  /** The "emit <output> now, change nothing" instruction for the extract pass. */
  readonly extractionPrompt: string;
  /** Extract-pass retries on schema-validation failure (default 3). */
  readonly maxAttempts?: number;
}

export async function runWithExtraction<T, A extends AgentProvider>(
  options: RunWithExtractionOptions<T, A>,
): Promise<RunResult & { readonly output: T }> {
  const { output, extractionPrompt, maxAttempts = 3, agent, sandbox, ...produceInputs } = options;

  // --- Produce pass: do the work, no schema. RunResult exposes `.resume()`. ---
  const produce = await run({ agent, sandbox, ...produceInputs } as RunOptions<A>);

  if (!produce.resume) {
    throw new Error(
      "runWithExtraction: the agent provider does not support session resume, so the extract pass cannot run.",
    );
  }

  // --- Extract pass: resume the produce session, attach the schema, retry. ---
  let lastError: StructuredOutputError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let extract: RunResult & { readonly output: T };

      if (!lastError) {
        // First extract: resume the produce session with the extraction prompt.
        extract = (await produce.resume(extractionPrompt, { output })) as RunResult & {
          readonly output: T;
        };
      } else {
        // Retry: resume the failed extract session with corrective feedback.
        if (!lastError.sessionId) {
          throw new Error(
            "runWithExtraction: the failed extract pass returned no sessionId, so it cannot be resumed for a retry.",
          );
        }
        extract = await run({
          agent,
          sandbox,
          name: produceInputs.name
            ? `${produceInputs.name} (extract retry ${attempt - 1})`
            : undefined,
          resumeSession: lastError.sessionId,
          prompt: buildRetryFeedback(lastError, attempt, maxAttempts),
          output,
        } as RunOptions<A> & { output: OutputObjectDefinition<T> });
      }

      // Side effects (commits) belong to the produce pass; carry its RunResult,
      // but hand back the extract pass's validated output.
      return { ...produce, output: extract.output };
    } catch (error) {
      if (error instanceof StructuredOutputError) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

import {
  run,
  StructuredOutputError,
  type AgentProvider,
  type OutputObjectDefinition,
  type RunOptions,
  type RunResult,
} from "@ai-hero/sandcastle";

import { buildRetryFeedback } from "./retry-feedback.mjs";

export interface RunWithRetryOptions<T, A extends AgentProvider>
  extends Omit<RunOptions<A>, "output"> {
  readonly output: OutputObjectDefinition<T>;
  readonly maxAttempts?: number;
}

export async function runWithRetry<T, A extends AgentProvider>(
  options: RunWithRetryOptions<T, A>,
): Promise<RunResult & { readonly output: T }> {
  const { output, maxAttempts = 3, ...runOptions } = options;

  let lastError: StructuredOutputError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (!lastError) {
        return await run({ ...runOptions, output });
      }

      if (!lastError.sessionId) {
        throw new Error(
          "runWithRetry: the failed run returned no sessionId, so it cannot be resumed for a retry.",
        );
      }

      const { promptArgs: _promptArgs, ...retryOptions } = runOptions;

      return await run({
        ...retryOptions,
        name: retryOptions.name
          ? `${retryOptions.name} (retry ${attempt - 1})`
          : undefined,
        promptFile: undefined,
        prompt: buildRetryFeedback(lastError, attempt, maxAttempts),
        resumeSession: lastError.sessionId,
        output,
      });
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

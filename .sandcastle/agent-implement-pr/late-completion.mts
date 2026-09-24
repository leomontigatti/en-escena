// Implement PR's output when the agent finished after the wall-clock budget
// (#1186). The budget's abort rejects the produce pass, so the extract pass that
// normally yields the structured output never runs. The prompt's OUTPUT section
// already asks for an `<output>` block, and an agent that finished usually wrote
// one, so the run reads it back from its own text; without a valid one, the
// commits still land and a note says the replies were not recovered.

import { implementPrSchema, type ImplementPrOutput } from "./output.mjs";

export const lateCompletionNote =
  "This run finished after its wall-clock budget, so its replies could not be " +
  "recovered. Any commits it made are pushed; the threads are still open and " +
  "need checking against the branch.";

const outputBlockPattern = /<output>([\s\S]*?)<\/output>/g;

export function recoverLateOutput(text: string): ImplementPrOutput {
  const blocks = [...text.matchAll(outputBlockPattern)];
  const last = blocks.at(-1)?.[1];

  if (last !== undefined) {
    try {
      const parsed = implementPrSchema.safeParse(JSON.parse(last));
      if (parsed.success) {
        return parsed.data;
      }
    } catch {
      // Not JSON: the agent was cut off mid-block, or wrote prose inside it.
    }
  }

  return {
    threadReplies: [],
    newInlineComments: [],
    topLevelComments: [{ body: lateCompletionNote }],
  };
}

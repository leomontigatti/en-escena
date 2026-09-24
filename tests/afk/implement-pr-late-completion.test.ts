import { describe, expect, it } from "vitest";

import {
  lateCompletionNote,
  recoverLateOutput,
} from "../../.sandcastle/agent-implement-pr/late-completion.mjs";
import {
  BudgetExhaustedError,
  COMPLETION_SIGNAL,
  createCompletionWatch,
  isLateCompletion,
} from "../../.sandcastle/lib/runner.mjs";

// #1186: run 35989696715 finished every brief on #1185 three minutes after its
// budget, printed the completion signal and its `<output>` block, and still
// failed: the rejected produce pass never reached the extract pass, so six
// green commits were never pushed. Implement PR now recovers from its own text.

function outputBlock(value: unknown) {
  return `<output>\n${JSON.stringify(value)}\n</output>`;
}

describe("recoverLateOutput", () => {
  it("takes the output block the agent wrote before it was cut off", () => {
    const text = [
      "All six threads are addressed.",
      COMPLETION_SIGNAL,
      outputBlock({
        threadReplies: [{ commentId: "PRRC_1", body: "Done in `49ab3d79`." }],
        topLevelComments: [{ body: "Six commits." }],
      }),
    ].join("\n");

    expect(recoverLateOutput(text)).toEqual({
      threadReplies: [{ commentId: "PRRC_1", body: "Done in `49ab3d79`." }],
      newInlineComments: [],
      topLevelComments: [{ body: "Six commits." }],
    });
  });

  it("uses the last block when the agent wrote more than one", () => {
    const text = [
      outputBlock({ topLevelComments: [{ body: "draft" }] }),
      outputBlock({ topLevelComments: [{ body: "final" }] }),
    ].join("\n");

    expect(recoverLateOutput(text).topLevelComments).toEqual([
      { body: "final" },
    ]);
  });

  it("falls back to a note when there is no block to recover", () => {
    expect(recoverLateOutput(`done\n${COMPLETION_SIGNAL}`)).toEqual({
      threadReplies: [],
      newInlineComments: [],
      topLevelComments: [{ body: lateCompletionNote }],
    });
  });

  it("falls back to a note when the block is not valid output", () => {
    const text = `<output>\n{ "threadReplies": [{ "body": 3 }\n</output>`;

    expect(recoverLateOutput(text).topLevelComments).toEqual([
      { body: lateCompletionNote },
    ]);
  });
});

describe("createCompletionWatch", () => {
  it("keeps the text it observed, so a late run can recover its output", () => {
    const watch = createCompletionWatch();

    watch.observe("first ");
    watch.observe("second");

    expect(watch.text).toBe("first second");
  });
});

describe("isLateCompletion", () => {
  function watchThatSaw(signal: boolean) {
    const watch = createCompletionWatch();
    if (signal) watch.observe(COMPLETION_SIGNAL);
    return watch;
  }

  it("is a budget abort after the signal, with a clean tree", () => {
    expect(
      isLateCompletion(
        new BudgetExhaustedError(50),
        watchThatSaw(true),
        () => true,
      ),
    ).toBe(true);
  });

  it("is not when the agent never emitted the signal", () => {
    expect(
      isLateCompletion(
        new BudgetExhaustedError(50),
        watchThatSaw(false),
        () => true,
      ),
    ).toBe(false);
  });

  it("is not when the tree is dirty", () => {
    expect(
      isLateCompletion(
        new BudgetExhaustedError(50),
        watchThatSaw(true),
        () => false,
      ),
    ).toBe(false);
  });

  it("is not for an ordinary failure", () => {
    expect(
      isLateCompletion(new Error("boom"), watchThatSaw(true), () => true),
    ).toBe(false);
  });
});

import { describe, expect, test } from "vitest";

import {
  deriveJudgeScoreStatus,
  judgeScoreStatusLabels,
} from "@/lib/judging/judge-status";

describe("a judge's own status on a presentation", () => {
  test("is `Descalificada` whatever the judge saved", () => {
    expect(
      deriveJudgeScoreStatus({
        disqualified: true,
        hasFeedbackAudio: true,
        value: "90.0",
      }),
    ).toBe("disqualified");
  });

  test("is `Pendiente` without a score and without a value", () => {
    expect(
      deriveJudgeScoreStatus({
        disqualified: false,
        hasFeedbackAudio: false,
        value: null,
      }),
    ).toBe("pending");
    expect(
      deriveJudgeScoreStatus({
        disqualified: false,
        hasFeedbackAudio: true,
        value: null,
      }),
    ).toBe("pending");
  });

  test("tells a complete score from one without a `Devolución`", () => {
    expect(
      deriveJudgeScoreStatus({
        disqualified: false,
        hasFeedbackAudio: true,
        value: "80.5",
      }),
    ).toBe("complete");
    expect(
      deriveJudgeScoreStatus({
        disqualified: false,
        hasFeedbackAudio: false,
        value: "80.5",
      }),
    ).toBe("noFeedback");
  });

  test("names each status as the judge reads it", () => {
    expect(judgeScoreStatusLabels.pending).toBe("Pendiente");
    expect(judgeScoreStatusLabels.complete).toBe("Completa");
    expect(judgeScoreStatusLabels.noFeedback).toBe("Sin devolución");
    expect(judgeScoreStatusLabels.disqualified).toBe("Descalificada");
  });
});

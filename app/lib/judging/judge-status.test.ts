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
    ).toBe("descalificada");
  });

  test("is `Pendiente` without a score and without a value", () => {
    expect(
      deriveJudgeScoreStatus({
        disqualified: false,
        hasFeedbackAudio: false,
        value: null,
      }),
    ).toBe("pendiente");
    expect(
      deriveJudgeScoreStatus({
        disqualified: false,
        hasFeedbackAudio: true,
        value: null,
      }),
    ).toBe("pendiente");
  });

  test("tells a complete score from one without a `Devolución`", () => {
    expect(
      deriveJudgeScoreStatus({
        disqualified: false,
        hasFeedbackAudio: true,
        value: "80.5",
      }),
    ).toBe("completa");
    expect(
      deriveJudgeScoreStatus({
        disqualified: false,
        hasFeedbackAudio: false,
        value: "80.5",
      }),
    ).toBe("sinDevolucion");
  });

  test("names each status as the judge reads it", () => {
    expect(judgeScoreStatusLabels.pendiente).toBe("Pendiente");
    expect(judgeScoreStatusLabels.completa).toBe("Completa");
    expect(judgeScoreStatusLabels.sinDevolucion).toBe("Sin devolución");
    expect(judgeScoreStatusLabels.descalificada).toBe("Descalificada");
  });
});

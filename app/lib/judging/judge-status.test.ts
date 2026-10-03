import { describe, expect, test } from "vitest";

import {
  deriveJudgeScoreStatus,
  judgeScoreStatusBadge,
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

  test("shows the judge's own score in place of `Completa`", () => {
    expect(
      judgeScoreStatusBadge({
        isOpen: true,
        status: "complete",
        value: "87.5",
      }),
    ).toEqual({ label: "87.5", variant: "success" });
    expect(
      judgeScoreStatusBadge({
        isOpen: true,
        status: "complete",
        value: "90.0",
      }),
    ).toEqual({ label: "90", variant: "success" });
  });

  test("warns about a score without a `Devolución`", () => {
    expect(
      judgeScoreStatusBadge({
        isOpen: true,
        status: "noFeedback",
        value: "80.5",
      }),
    ).toEqual({ label: "Sin devolución", variant: "warning" });
  });

  test("keeps `Pendiente` and `Descalificada` as words, never a score", () => {
    expect(
      judgeScoreStatusBadge({ isOpen: true, status: "pending", value: null }),
    ).toEqual({
      label: "Pendiente",
      variant: "outline",
    });
    expect(
      judgeScoreStatusBadge({
        isOpen: true,
        status: "disqualified",
        value: "90.0",
      }),
    ).toEqual({ label: "Descalificada", variant: "destructive" });
  });

  test("on a closed day, shows the score with or without a `Devolución`, since it can no longer be fixed", () => {
    expect(
      judgeScoreStatusBadge({
        isOpen: false,
        status: "noFeedback",
        value: "80.0",
      }),
    ).toEqual({ label: "80", variant: "success" });
    expect(
      judgeScoreStatusBadge({
        isOpen: false,
        status: "complete",
        value: "87.5",
      }),
    ).toEqual({ label: "87.5", variant: "success" });
  });

  test("on a closed day, keeps `Pendiente` and `Descalificada`", () => {
    expect(
      judgeScoreStatusBadge({ isOpen: false, status: "pending", value: null }),
    ).toEqual({ label: "Pendiente", variant: "outline" });
    expect(
      judgeScoreStatusBadge({
        isOpen: false,
        status: "disqualified",
        value: "90.0",
      }),
    ).toEqual({ label: "Descalificada", variant: "destructive" });
  });
});

import { describe, expect, test } from "vitest";

import {
  feedbackAudioFieldSubmission,
  feedbackAudioFieldUrl,
  initialFeedbackAudioField,
  isFeedbackAudioFieldDirty,
  reduceFeedbackAudioField,
} from "./feedback-audio-field";

function buildTake(url: string) {
  return { blob: new Blob(["take"], { type: "audio/webm" }), url };
}

describe("the `Devolución` in the score form", () => {
  test("has nothing to play and nothing to say when no take was ever stored", () => {
    const state = initialFeedbackAudioField(null);

    expect(feedbackAudioFieldUrl(state)).toBeNull();
    expect(isFeedbackAudioFieldDirty(state)).toBe(false);
    expect(feedbackAudioFieldSubmission(state)).toEqual({ intent: "keep" });
  });

  test("plays back the stored take and leaves it alone until the judge acts", () => {
    const state = initialFeedbackAudioField("https://audio/stored");

    expect(feedbackAudioFieldUrl(state)).toBe("https://audio/stored");
    expect(isFeedbackAudioFieldDirty(state)).toBe(false);
    expect(feedbackAudioFieldSubmission(state)).toEqual({ intent: "keep" });
  });

  test("posts a take recorded in the form as a replacement", () => {
    const take = buildTake("blob:take");
    const state = reduceFeedbackAudioField(
      initialFeedbackAudioField("https://audio/stored"),
      { take, type: "recorded" },
    );

    expect(feedbackAudioFieldUrl(state)).toBe("blob:take");
    expect(isFeedbackAudioFieldDirty(state)).toBe(true);
    expect(feedbackAudioFieldSubmission(state)).toEqual({
      blob: take.blob,
      intent: "replace",
    });
  });

  test("posts a removal when the stored take is deleted", () => {
    const state = reduceFeedbackAudioField(
      initialFeedbackAudioField("https://audio/stored"),
      { type: "deleted" },
    );

    expect(feedbackAudioFieldUrl(state)).toBeNull();
    expect(isFeedbackAudioFieldDirty(state)).toBe(true);
    expect(feedbackAudioFieldSubmission(state)).toEqual({ intent: "remove" });
  });

  test("leaves the stored take alone when a take recorded over it is deleted too", () => {
    const recorded = reduceFeedbackAudioField(
      initialFeedbackAudioField("https://audio/stored"),
      { take: buildTake("blob:take"), type: "recorded" },
    );
    const state = reduceFeedbackAudioField(recorded, { type: "deleted" });

    expect(feedbackAudioFieldUrl(state)).toBeNull();
    expect(feedbackAudioFieldSubmission(state)).toEqual({ intent: "remove" });
  });

  test("has nothing left to lose once a take recorded over nothing is deleted", () => {
    const recorded = reduceFeedbackAudioField(initialFeedbackAudioField(null), {
      take: buildTake("blob:take"),
      type: "recorded",
    });
    const state = reduceFeedbackAudioField(recorded, { type: "deleted" });

    expect(isFeedbackAudioFieldDirty(state)).toBe(false);
    expect(feedbackAudioFieldSubmission(state)).toEqual({ intent: "keep" });
  });
});

import { describe, expect, test } from "vitest";

import {
  hasFilledTake,
  idleTakeState,
  maxRecordingMs,
  reduceTake,
  takeElapsedMs,
  type TakeState,
} from "./feedback-take";

const start = 1_000;

function recordingFrom(at: number): TakeState {
  return reduceTake(reduceTake(idleTakeState, { type: "requested" }), {
    at,
    type: "started",
  });
}

describe("the judge's take on the mic", () => {
  test("waits while the mic is being asked for, then records from zero", () => {
    const requesting = reduceTake(idleTakeState, { type: "requested" });

    expect(requesting.phase).toBe("requesting");

    const recording = reduceTake(requesting, { at: start, type: "started" });

    expect(recording.phase).toBe("recording");
    expect(takeElapsedMs(recording, start)).toBe(0);
  });

  test("goes back to idle when the mic cannot be used", () => {
    const requesting = reduceTake(idleTakeState, { type: "requested" });

    expect(reduceTake(requesting, { type: "failed" })).toEqual(idleTakeState);
  });

  test("counts the time that passes while it records", () => {
    const recording = recordingFrom(start);

    expect(takeElapsedMs(recording, start + 2_500)).toBe(2_500);
  });

  test("freezes the elapsed time while paused and keeps counting on resume", () => {
    const paused = reduceTake(recordingFrom(start), {
      at: start + 2_000,
      type: "paused",
    });

    expect(paused.phase).toBe("paused");
    expect(takeElapsedMs(paused, start + 9_000)).toBe(2_000);

    const resumed = reduceTake(paused, { at: start + 9_000, type: "resumed" });

    expect(resumed.phase).toBe("recording");
    expect(takeElapsedMs(resumed, start + 10_000)).toBe(3_000);
  });

  test("never reads past three minutes, which is where the take fills up", () => {
    const recording = recordingFrom(start);

    expect(hasFilledTake(recording, start + maxRecordingMs - 1)).toBe(false);
    expect(hasFilledTake(recording, start + maxRecordingMs)).toBe(true);
    expect(takeElapsedMs(recording, start + maxRecordingMs + 5_000)).toBe(
      maxRecordingMs,
    );
  });

  test("is idle again once the take is finished", () => {
    expect(reduceTake(recordingFrom(start), { type: "finished" })).toEqual(
      idleTakeState,
    );
  });
});

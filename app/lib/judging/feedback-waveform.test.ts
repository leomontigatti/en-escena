import { describe, expect, test } from "vitest";

import {
  emptyLevels,
  formatDuration,
  micLevel,
  summarizePeaks,
  waveformBarCount,
} from "./feedback-waveform";

describe("the waveform the judge watches", () => {
  test("shows a flat line until there is sound to draw", () => {
    const levels = emptyLevels();

    expect(levels).toHaveLength(waveformBarCount);
    expect(levels.every((level) => level === 0)).toBe(true);
  });

  test("reads silence on the mic as no level and a loud voice as a full one", () => {
    const silence = new Uint8Array(64).fill(128);
    const loud = Uint8Array.from({ length: 64 }, (_, index) =>
      index % 2 === 0 ? 0 : 255,
    );

    expect(micLevel(silence)).toBe(0);
    expect(micLevel(loud)).toBe(1);
  });

  test("draws one bar per bucket of the recording, with the loudest bar full", () => {
    const samples = new Float32Array(waveformBarCount * 4);
    samples[0] = 0.25;
    samples[samples.length - 1] = 0.5;

    const peaks = summarizePeaks(samples);

    expect(peaks).toHaveLength(waveformBarCount);
    expect(peaks[0]).toBe(0.5);
    expect(peaks.at(-1)).toBe(1);
    expect(peaks[1]).toBe(0);
  });

  test("draws a silent recording flat instead of dividing by nothing", () => {
    expect(summarizePeaks(new Float32Array(waveformBarCount))).toEqual(
      emptyLevels(),
    );
  });

  test("reads a position as minutes and seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65_400)).toBe("1:05");
    expect(formatDuration(180_000)).toBe("3:00");
  });
});

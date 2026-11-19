/** @vitest-environment jsdom */

import { afterEach, describe, expect, test, vi } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { FeedbackPlayback } from "./feedback-playback";

describe("FeedbackPlayback", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    vi.unstubAllGlobals();
  });

  test("stops loading the take's waveform when the player goes away", () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "AudioContext",
      class {
        close = () => Promise.resolve();
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((_url, init) => {
        if (init?.signal) {
          signals.push(init.signal);
        }

        return new Promise(() => {});
      }),
    );

    renderer.render(<FeedbackPlayback audioUrl="https://audio/stored" />);
    expect(signals.map((signal) => signal.aborted)).toEqual([false]);

    renderer.cleanup();

    expect(signals.map((signal) => signal.aborted)).toEqual([true]);
  });
});

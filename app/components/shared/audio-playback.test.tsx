/** @vitest-environment jsdom */

import { act } from "react";
import { toast } from "sonner";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

import { AudioPlayback } from "./audio-playback";

/**
 * jsdom's `<audio>` never loads anything, so the test plays the part of the
 * browser: it hands over a length and a position and fires the events a real
 * element would.
 */
function getAudio() {
  const audio = document.querySelector("audio");

  if (!audio) {
    throw new Error("Expected an <audio> element to be rendered.");
  }

  let currentTime = 0;
  Object.defineProperty(audio, "currentTime", {
    configurable: true,
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    },
  });

  return {
    audio,
    loadDuration(seconds: number) {
      Object.defineProperty(audio, "duration", {
        configurable: true,
        value: seconds,
      });
      act(() => {
        audio.dispatchEvent(new Event("loadedmetadata"));
      });
    },
  };
}

function getReadout() {
  return document.querySelector("[data-slot=audio-time]")?.textContent;
}

describe("listening to an audio file", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    vi.restoreAllMocks();
  });

  test("shows the length of the file once the player knows it", () => {
    renderer.render(
      <AudioPlayback audioUrl="blob:song" errorMessage="No se pudo." />,
    );

    expect(getReadout()).toBe("0:00 / 0:00");

    getAudio().loadDuration(125);

    expect(getReadout()).toBe("0:00 / 2:05");
  });

  // A server-rendered `<audio>` starts loading before React hydrates, so its
  // `loadedmetadata` can fire before anything is listening.
  test("shows the length of a file that loaded before the player was ready", () => {
    vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(
      HTMLMediaElement.HAVE_METADATA,
    );
    vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(
      125,
    );

    renderer.render(
      <AudioPlayback audioUrl="blob:song" errorMessage="No se pudo." />,
    );

    expect(getReadout()).toBe("0:00 / 2:05");
  });

  test("jumps to where the slider is moved", () => {
    renderer.render(
      <AudioPlayback audioUrl="blob:song" errorMessage="No se pudo." />,
    );
    const { audio, loadDuration } = getAudio();
    loadDuration(125);

    const slider = document.querySelector<HTMLElement>("[role=slider]");
    expect(slider?.getAttribute("aria-label")).toBe("Posición");

    act(() => {
      slider?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "PageUp" }),
      );
    });

    expect(audio.currentTime).toBe(10);
    expect(getReadout()).toBe("0:10 / 2:05");
  });

  test("says so, in the caller's words, when the file cannot be played", async () => {
    const errors: string[] = [];
    vi.spyOn(toast, "error").mockImplementation((message) => {
      errors.push(String(message));

      return "";
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new Error("NotSupportedError"),
    );
    renderer.render(
      <AudioPlayback
        audioUrl="blob:song"
        errorMessage="No se pudo reproducir la música."
      />,
    );

    await clickReactDomButton("Escuchar");

    expect(errors).toEqual(["No se pudo reproducir la música."]);
  });
});

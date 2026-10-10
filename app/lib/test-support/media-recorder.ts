import { vi } from "vitest";

/**
 * The browser APIs one take needs, none of which jsdom has. `stop` finishes the
 * take synchronously, which is all the recorder's own state machine asks for —
 * unless `handOverOnDemand` is set, when the audio waits for the returned
 * `handOver`, as a real `MediaRecorder` hands it over a moment after stopping.
 */
export function installRecorderStubs({
  handOverOnDemand = false,
}: { handOverOnDemand?: boolean } = {}) {
  let pendingHandOver: (() => void) | null = null;

  class FakeMediaRecorder {
    static isTypeSupported = () => true;
    mimeType = "audio/webm";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    state = "inactive";

    start() {
      this.state = "recording";
    }

    stop() {
      this.state = "inactive";
      const handOver = () => {
        this.ondataavailable?.({ data: new Blob(["take"]) });
        this.onstop?.();
      };
      if (handOverOnDemand) {
        pendingHandOver = handOver;
      } else {
        handOver();
      }
    }
  }

  const stubs = {
    AudioContext: class {
      close = () => Promise.resolve();
      createAnalyser = () => ({
        fftSize: 1024,
        getByteTimeDomainData: () => {},
      });
      createMediaStreamSource = () => ({ connect: () => {} });
    },
    MediaRecorder: FakeMediaRecorder,
  };

  for (const [name, value] of Object.entries(stubs)) {
    vi.stubGlobal(name, value);
  }

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) },
  });

  return {
    /** Hands over the audio of the take last stopped. */
    handOver() {
      pendingHandOver?.();
      pendingHandOver = null;
    },
  };
}

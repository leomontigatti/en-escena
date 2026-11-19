import { afterEach, describe, expect, test, vi } from "vitest";

import { decodeAudioFromUrl } from "./decode-audio";

function stubAudioContext() {
  const decoded: ArrayBuffer[] = [];
  let closed = 0;
  const buffer = { duration: 2 };

  vi.stubGlobal(
    "AudioContext",
    class {
      close() {
        closed++;

        return Promise.resolve();
      }
      decodeAudioData(data: ArrayBuffer) {
        decoded.push(data);

        return Promise.resolve(buffer);
      }
    },
  );

  return { buffer, decoded, closedCount: () => closed };
}

describe("decodeAudioFromUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("decodes the body of the take and closes its context", async () => {
    const audio = stubAudioContext();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(new Uint8Array([1, 2, 3]))),
      ),
    );

    const result = await decodeAudioFromUrl(
      "https://audio/take",
      new AbortController().signal,
    );

    expect(result).toBe(audio.buffer);
    expect(audio.decoded.map((data) => data.byteLength)).toEqual([3]);
    expect(audio.closedCount()).toBe(1);
  });

  test("rejects an error response without decoding it as audio", async () => {
    const audio = stubAudioContext();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response("<Error>Request has expired</Error>", { status: 403 }),
        ),
      ),
    );

    await expect(
      decodeAudioFromUrl("https://audio/expired", new AbortController().signal),
    ).rejects.toThrow("403");
    expect(audio.decoded).toEqual([]);
  });

  test("requests the take with the caller's signal", async () => {
    stubAudioContext();
    const fetchStub = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(new Uint8Array([1]))),
    );
    vi.stubGlobal("fetch", fetchStub);
    const controller = new AbortController();

    await decodeAudioFromUrl("https://audio/take", controller.signal);

    expect(fetchStub).toHaveBeenCalledWith("https://audio/take", {
      signal: controller.signal,
    });
  });
});

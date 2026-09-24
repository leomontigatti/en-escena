import { describe, expect, test } from "vitest";

import {
  type FeedbackAudioStorageAdapter,
  createFeedbackAudioStorage,
  loadFeedbackAudioDownloadUrl,
} from "./feedback-audio.server";

function createStorageAdapter(
  overrides: Partial<FeedbackAudioStorageAdapter> = {},
): FeedbackAudioStorageAdapter {
  return {
    createSignedUrl: async () => "https://example.test/signed",
    remove: async () => {},
    upload: async () => {},
    ...overrides,
  };
}

const take = { eventId: "event-1", judgeId: "judge-1", presentationId: "p-1" };

describe("feedback audio storage", () => {
  test("uploads a take under the event, presentation and judge", async () => {
    const uploads: Array<{ bucket: string; key: string }> = [];
    const storage = createFeedbackAudioStorage(
      createStorageAdapter({
        upload: async (input) => {
          uploads.push({ bucket: input.bucket, key: input.key });
        },
      }),
      { uniqueSuffix: () => "take-a" },
    );

    const result = await storage.uploadFeedbackAudio({
      ...take,
      file: new Blob(["audio"], { type: "audio/webm" }),
    });

    expect(result).toEqual({
      ok: true,
      storageKey:
        "events/event-1/presentations/p-1/judges/judge-1/devolucion-take-a.webm",
    });
    expect(uploads).toEqual([
      {
        bucket: "en-escena-feedback-audio",
        key: "events/event-1/presentations/p-1/judges/judge-1/devolucion-take-a.webm",
      },
    ]);
  });

  // The replacement is written before the old object is removed, so a key that
  // collided would destroy the take it replaces the moment the removal ran.
  test("gives every upload its own key, so a replacement never collides", async () => {
    let taken = 0;
    const storage = createFeedbackAudioStorage(createStorageAdapter(), {
      uniqueSuffix: () => `take-${(taken += 1)}`,
    });
    const upload = () =>
      storage.uploadFeedbackAudio({
        ...take,
        file: new Blob(["audio"], { type: "audio/webm" }),
      });

    const [first, second] = [await upload(), await upload()];

    expect(first.ok && second.ok && first.storageKey).not.toBe(
      second.ok && second.storageKey,
    );
  });

  test("refuses a file the feedback audio policy does not accept", async () => {
    const uploads: string[] = [];
    const storage = createFeedbackAudioStorage(
      createStorageAdapter({
        upload: async (input) => {
          uploads.push(input.key);
        },
      }),
    );

    const result = await storage.uploadFeedbackAudio({
      ...take,
      file: new Blob(["audio"], { type: "audio/mpeg" }),
    });

    expect(result).toEqual({
      ok: false,
      rejection: {
        contentType: "audio/mpeg",
        kind: "feedbackAudio",
        reason: "unsupported-content-type",
      },
    });
    expect(uploads).toEqual([]);
  });

  test("signs a stored take for the judge and the academy to listen to", async () => {
    const storage = createFeedbackAudioStorage(
      createStorageAdapter({
        createSignedUrl: async (input) =>
          `https://example.test/${input.bucket}/${input.key}?ttl=${input.expiresInSeconds}`,
      }),
    );

    expect(
      await loadFeedbackAudioDownloadUrl({
        storage,
        storageKey: "takes/a.webm",
      }),
    ).toBe(
      "https://example.test/en-escena-feedback-audio/takes/a.webm?ttl=300",
    );
  });

  test("reads no take as no url instead of throwing into a loader", async () => {
    const storage = createFeedbackAudioStorage(
      createStorageAdapter({
        createSignedUrl: async () => {
          throw new Error("unreachable");
        },
      }),
    );

    expect(
      await loadFeedbackAudioDownloadUrl({ storage, storageKey: null }),
    ).toBeNull();
    expect(
      await loadFeedbackAudioDownloadUrl({ storage, storageKey: "gone.webm" }),
    ).toBeNull();
  });

  test("removes a take from its own bucket", async () => {
    const removals: Array<{ bucket: string; keys: string[] }> = [];
    const storage = createFeedbackAudioStorage(
      createStorageAdapter({
        remove: async (input) => {
          removals.push(input);
        },
      }),
    );

    await storage.removeFeedbackAudio("takes/a.webm");

    expect(removals).toEqual([
      { bucket: "en-escena-feedback-audio", keys: ["takes/a.webm"] },
    ]);
  });
});

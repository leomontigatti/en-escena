import { describe, expect, test } from "vitest";

import {
  type ChoreographyMusicStorageAdapter,
  createChoreographyMusicStorage,
  createSupabaseChoreographyMusicStorage,
} from "./choreography-music.server";

function createStorageAdapter(
  overrides: Partial<ChoreographyMusicStorageAdapter>,
): ChoreographyMusicStorageAdapter {
  return {
    remove: async () => {},
    upload: async () => {},
    ...overrides,
  };
}

describe("choreography music storage", () => {
  test("uploads choreography music to the canonical academy-owned key", async () => {
    const uploads: Array<{
      bucket: string;
      file: Blob;
      key: string;
      options: { contentType: string; upsert: boolean };
    }> = [];
    const storage = createChoreographyMusicStorage(
      createStorageAdapter({
        upload: async (input) => {
          uploads.push(input);
        },
      }),
    );
    const file = new Blob(["music"], { type: "audio/mpeg" });

    const storageKey = await storage.uploadMusic({
      academyId: "academy-1",
      choreographyId: "choreography-1",
      file,
    });

    expect(storageKey).toBe(
      "academies/academy-1/choreographies/choreography-1/music.mp3",
    );
    expect(uploads).toEqual([
      {
        bucket: "choreography-music",
        file,
        key: "academies/academy-1/choreographies/choreography-1/music.mp3",
        options: {
          contentType: "audio/mpeg",
          upsert: true,
        },
      },
    ]);
  });

  test("uses canonical extensions for allowed music types", async () => {
    const storage = createChoreographyMusicStorage(createStorageAdapter({}));

    await expect(
      storage.uploadMusic({
        academyId: "academy-1",
        choreographyId: "choreography-1",
        file: new Blob(["music"], { type: "audio/mp4" }),
      }),
    ).resolves.toBe(
      "academies/academy-1/choreographies/choreography-1/music.m4a",
    );
    await expect(
      storage.uploadMusic({
        academyId: "academy-1",
        choreographyId: "choreography-1",
        file: new Blob(["music"], { type: "audio/x-wav" }),
      }),
    ).resolves.toBe(
      "academies/academy-1/choreographies/choreography-1/music.wav",
    );
  });

  test("rejects unsupported music types before uploading", async () => {
    const uploads: Array<unknown> = [];
    const storage = createChoreographyMusicStorage(
      createStorageAdapter({
        upload: async (input) => {
          uploads.push(input);
        },
      }),
    );

    await expect(
      storage.uploadMusic({
        academyId: "academy-1",
        choreographyId: "choreography-1",
        file: new Blob(["video"], { type: "video/mp4" }),
      }),
    ).rejects.toThrow(
      "Choreography music must be an MP3, M4A, WAV, or OGG file.",
    );
    expect(uploads).toEqual([]);
  });

  test("rejects music files larger than 50 MB before uploading", async () => {
    const uploads: Array<unknown> = [];
    const storage = createChoreographyMusicStorage(
      createStorageAdapter({
        upload: async (input) => {
          uploads.push(input);
        },
      }),
    );

    await expect(
      storage.uploadMusic({
        academyId: "academy-1",
        choreographyId: "choreography-1",
        file: new Blob([new Uint8Array(50 * 1024 * 1024 + 1)], {
          type: "audio/ogg",
        }),
      }),
    ).rejects.toThrow("Choreography music must be 50 MB or smaller.");
    expect(uploads).toEqual([]);
  });

  test("creates signed URLs and removes stored music through the adapter", async () => {
    const calls: Array<unknown> = [];
    const storage = createChoreographyMusicStorage(
      createStorageAdapter({
        createSignedUrl: async (input) => {
          calls.push({ ...input, type: "signed-url" });

          return "https://example.supabase.co/signed/music";
        },
        remove: async (input) => {
          calls.push({ ...input, type: "remove" });
        },
      }),
    );

    await expect(
      storage.createMusicSignedUrl(
        "academies/academy-1/choreographies/choreography-1/music.mp3",
      ),
    ).resolves.toBe("https://example.supabase.co/signed/music");
    await storage.removeMusic(
      "academies/academy-1/choreographies/choreography-1/music.mp3",
    );

    expect(calls).toEqual([
      {
        bucket: "choreography-music",
        expiresInSeconds: 300,
        key: "academies/academy-1/choreographies/choreography-1/music.mp3",
        type: "signed-url",
      },
      {
        bucket: "choreography-music",
        keys: ["academies/academy-1/choreographies/choreography-1/music.mp3"],
        type: "remove",
      },
    ]);
  });

  test("uses Supabase Storage for music uploads, signed URLs and removals", async () => {
    const uploadedFile = new Blob(["music"], { type: "audio/ogg" });
    const calls: Array<unknown> = [];
    const storage = createSupabaseChoreographyMusicStorage({
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (key: string, expiresInSeconds: number) => {
            calls.push({ bucket, expiresInSeconds, key, type: "signed-url" });

            return {
              data: { signedUrl: "https://example.supabase.co/signed/music" },
              error: null,
            };
          },
          remove: async (keys: string[]) => {
            calls.push({ bucket, keys, type: "remove" });

            return { error: null };
          },
          upload: async (
            key: string,
            file: Blob,
            options: { contentType: string; upsert: boolean },
          ) => {
            calls.push({ bucket, file, key, options, type: "upload" });

            return { error: null };
          },
        }),
      },
    });

    await expect(
      storage.uploadMusic({
        academyId: "academy-1",
        choreographyId: "choreography-1",
        file: uploadedFile,
      }),
    ).resolves.toBe(
      "academies/academy-1/choreographies/choreography-1/music.ogg",
    );
    await expect(
      storage.createMusicSignedUrl(
        "academies/academy-1/choreographies/choreography-1/music.ogg",
      ),
    ).resolves.toBe("https://example.supabase.co/signed/music");
    await storage.removeMusic(
      "academies/academy-1/choreographies/choreography-1/music.ogg",
    );

    expect(calls).toEqual([
      {
        bucket: "choreography-music",
        file: uploadedFile,
        key: "academies/academy-1/choreographies/choreography-1/music.ogg",
        options: {
          contentType: "audio/ogg",
          upsert: true,
        },
        type: "upload",
      },
      {
        bucket: "choreography-music",
        expiresInSeconds: 300,
        key: "academies/academy-1/choreographies/choreography-1/music.ogg",
        type: "signed-url",
      },
      {
        bucket: "choreography-music",
        keys: ["academies/academy-1/choreographies/choreography-1/music.ogg"],
        type: "remove",
      },
    ]);
  });
});

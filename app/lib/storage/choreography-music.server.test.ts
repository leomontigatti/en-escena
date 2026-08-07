import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  type ChoreographyMusicStorageAdapter,
  createChoreographyMusicStorage,
  createFilesystemChoreographyMusicStorage,
  loadChoreographyMusicDownloadUrl,
} from "./choreography-music.server";
import { serveFilesystemObject } from "./filesystem-client.server";

function createStorageAdapter(
  overrides: Partial<ChoreographyMusicStorageAdapter>,
): ChoreographyMusicStorageAdapter {
  return {
    createSignedUrl: async () => "https://example.test/signed",
    remove: async () => {},
    upload: async () => {},
    ...overrides,
  };
}

function expectUploaded(
  result: Awaited<
    ReturnType<ReturnType<typeof createChoreographyMusicStorage>["uploadMusic"]>
  >,
) {
  if (!result.ok) {
    throw new Error(`Expected an upload, got ${result.rejection.reason}`);
  }

  return result.storageKey;
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

    const result = await storage.uploadMusic({
      academyId: "academy-1",
      choreographyId: "choreography-1",
      file,
    });

    expect(expectUploaded(result)).toBe(
      "academies/academy-1/choreographies/choreography-1/music.mp3",
    );
    expect(uploads).toEqual([
      {
        bucket: "en-escena-choreography-music",
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

    expect(
      expectUploaded(
        await storage.uploadMusic({
          academyId: "academy-1",
          choreographyId: "choreography-1",
          file: new Blob(["music"], { type: "audio/mp4" }),
        }),
      ),
    ).toBe("academies/academy-1/choreographies/choreography-1/music.m4a");
    expect(
      expectUploaded(
        await storage.uploadMusic({
          academyId: "academy-1",
          choreographyId: "choreography-1",
          file: new Blob(["music"], { type: "audio/x-wav" }),
        }),
      ),
    ).toBe("academies/academy-1/choreographies/choreography-1/music.wav");
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

    const result = await storage.uploadMusic({
      academyId: "academy-1",
      choreographyId: "choreography-1",
      file: new Blob(["video"], { type: "video/mp4" }),
    });

    expect(result).toEqual({
      ok: false,
      rejection: {
        contentType: "video/mp4",
        kind: "choreographyMusic",
        reason: "unsupported-content-type",
      },
    });
    expect(uploads).toEqual([]);
  });

  test("rejects music files larger than the ceiling before uploading", async () => {
    const uploads: Array<unknown> = [];
    const storage = createChoreographyMusicStorage(
      createStorageAdapter({
        upload: async (input) => {
          uploads.push(input);
        },
      }),
    );
    const sizeBytes = 50 * 1024 * 1024 + 1;

    const result = await storage.uploadMusic({
      academyId: "academy-1",
      choreographyId: "choreography-1",
      file: new Blob([new Uint8Array(sizeBytes)], { type: "audio/ogg" }),
    });

    expect(result).toEqual({
      ok: false,
      rejection: {
        kind: "choreographyMusic",
        reason: "file-too-large",
        sizeBytes,
      },
    });
    expect(uploads).toEqual([]);
  });

  test("creates signed URLs and removes stored music through the adapter", async () => {
    const calls: Array<unknown> = [];
    const storage = createChoreographyMusicStorage(
      createStorageAdapter({
        createSignedUrl: async (input) => {
          calls.push({ ...input, type: "signed-url" });

          return "https://example.test/signed/music";
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
    ).resolves.toBe("https://example.test/signed/music");
    await storage.removeMusic(
      "academies/academy-1/choreographies/choreography-1/music.mp3",
    );

    expect(calls).toEqual([
      {
        bucket: "en-escena-choreography-music",
        expiresInSeconds: 300,
        key: "academies/academy-1/choreographies/choreography-1/music.mp3",
        type: "signed-url",
      },
      {
        bucket: "en-escena-choreography-music",
        keys: ["academies/academy-1/choreographies/choreography-1/music.mp3"],
        type: "remove",
      },
    ]);
  });

  test("stores music on the local volume, signs a route and removes it", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "en-escena-music-"));
    const secret = "volume-signing-secret";

    try {
      const storage = createFilesystemChoreographyMusicStorage({
        baseDir,
        now: () => 1_000_000,
        secret,
      });

      const storageKey = expectUploaded(
        await storage.uploadMusic({
          academyId: "academy-1",
          choreographyId: "choreography-1",
          file: new Blob(["song"], { type: "audio/mpeg" }),
        }),
      );

      expect(storageKey).toBe(
        "academies/academy-1/choreographies/choreography-1/music.mp3",
      );

      const signedUrl = await storage.createMusicSignedUrl(storageKey);
      const params = new URL(signedUrl, "https://sistema.enescena.com.ar")
        .searchParams;

      const served = await serveFilesystemObject({
        baseDir,
        now: 1_000_000,
        params,
        secret,
      });

      expect(served.status).toBe(200);
      expect(served.headers.get("Content-Type")).toBe("audio/mpeg");
      expect(await served.text()).toBe("song");

      await storage.removeMusic(storageKey);

      const afterRemoval = await serveFilesystemObject({
        baseDir,
        now: 1_000_000,
        params,
        secret,
      });

      expect(afterRemoval.status).toBe(404);
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });
});

describe("loadChoreographyMusicDownloadUrl", () => {
  test("yields no link for an absent key rather than asking the store", async () => {
    let calls = 0;
    const storage = createChoreographyMusicStorage(
      createStorageAdapter({
        createSignedUrl: async () => {
          calls += 1;

          return "https://example.test/signed";
        },
      }),
    );

    await expect(
      loadChoreographyMusicDownloadUrl({ storage, storageKey: null }),
    ).resolves.toBeNull();
    expect(calls).toBe(0);
  });

  // One unreachable object must not blank the whole detail view.
  test("yields no link when the object is unreachable", async () => {
    const storage = createChoreographyMusicStorage(
      createStorageAdapter({
        createSignedUrl: async () => {
          throw new Error("volume unavailable");
        },
      }),
    );

    await expect(
      loadChoreographyMusicDownloadUrl({
        storage,
        storageKey: "academies/a/choreographies/c/music.mp3",
      }),
    ).resolves.toBeNull();
  });
});

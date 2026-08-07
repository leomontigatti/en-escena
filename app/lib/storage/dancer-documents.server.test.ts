import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { serveFilesystemObject } from "./filesystem-client.server";
import {
  type DancerDocumentStorageAdapter,
  createDancerDocumentStorage,
  createFilesystemDancerDocumentStorage,
  loadDancerDocumentImageUrls,
} from "./dancer-documents.server";

function createStorageAdapter(
  overrides: Partial<DancerDocumentStorageAdapter>,
): DancerDocumentStorageAdapter {
  return {
    createSignedUrl: async () => "https://example.test/signed",
    list: async () => [],
    remove: async () => {},
    upload: async () => {},
    ...overrides,
  };
}

function expectUploaded(
  result: Awaited<
    ReturnType<
      ReturnType<typeof createDancerDocumentStorage>["uploadDocumentImage"]
    >
  >,
) {
  if (!result.ok) {
    throw new Error(`Expected an upload, got ${result.rejection.reason}`);
  }

  return result.storageKey;
}

describe("dancer document storage", () => {
  test("uploads a dancer document image to the canonical academy-owned key", async () => {
    const uploads: Array<{
      bucket: string;
      file: Blob;
      key: string;
      options: { contentType: string; upsert: boolean };
    }> = [];

    const storage = createDancerDocumentStorage(
      createStorageAdapter({
        upload: async (input) => {
          uploads.push(input);
        },
      }),
    );

    const file = new Blob(["front"], { type: "image/jpeg" });

    const storageKey = expectUploaded(
      await storage.uploadDocumentImage({
        academyId: "academy-1",
        dancerId: "dancer-1",
        file,
        side: "front",
      }),
    );

    expect(storageKey).toBe(
      "academies/academy-1/dancers/dancer-1/document-front.jpg",
    );
    expect(uploads).toEqual([
      {
        bucket: "en-escena-dancer-documents",
        file,
        key: "academies/academy-1/dancers/dancer-1/document-front.jpg",
        options: {
          contentType: "image/jpeg",
          upsert: true,
        },
      },
    ]);
  });

  test("uses the back document key and file extension for other allowed image types", async () => {
    const uploads: Array<{
      bucket: string;
      file: Blob;
      key: string;
      options: { contentType: string; upsert: boolean };
    }> = [];

    const storage = createDancerDocumentStorage(
      createStorageAdapter({
        upload: async (input) => {
          uploads.push(input);
        },
      }),
    );

    const file = new Blob(["back"], { type: "image/webp" });

    const storageKey = expectUploaded(
      await storage.uploadDocumentImage({
        academyId: "academy-2",
        dancerId: "dancer-2",
        file,
        side: "back",
      }),
    );

    expect(storageKey).toBe(
      "academies/academy-2/dancers/dancer-2/document-back.webp",
    );
    expect(uploads).toEqual([
      {
        bucket: "en-escena-dancer-documents",
        file,
        key: "academies/academy-2/dancers/dancer-2/document-back.webp",
        options: {
          contentType: "image/webp",
          upsert: true,
        },
      },
    ]);
  });

  test("rejects unsupported document image types before uploading", async () => {
    const uploads: Array<unknown> = [];
    const storage = createDancerDocumentStorage(
      createStorageAdapter({
        upload: async (input) => {
          uploads.push(input);
        },
      }),
    );

    const result = await storage.uploadDocumentImage({
      academyId: "academy-1",
      dancerId: "dancer-1",
      file: new Blob(["pdf"], { type: "application/pdf" }),
      side: "front",
    });

    expect(result).toEqual({
      ok: false,
      rejection: {
        contentType: "application/pdf",
        kind: "dancerDocumentImage",
        reason: "unsupported-content-type",
      },
    });
    expect(uploads).toEqual([]);
  });

  test("rejects document image files larger than 10 MB before uploading", async () => {
    const uploads: Array<unknown> = [];
    const storage = createDancerDocumentStorage(
      createStorageAdapter({
        upload: async (input) => {
          uploads.push(input);
        },
      }),
    );

    const sizeBytes = 10 * 1024 * 1024 + 1;
    const result = await storage.uploadDocumentImage({
      academyId: "academy-1",
      dancerId: "dancer-1",
      file: new Blob([new Uint8Array(sizeBytes)], { type: "image/png" }),
      side: "front",
    });

    expect(result).toEqual({
      ok: false,
      rejection: {
        kind: "dancerDocumentImage",
        reason: "file-too-large",
        sizeBytes,
      },
    });
    expect(uploads).toEqual([]);
  });

  test("removes previous files for the same document side regardless of extension", async () => {
    const calls: Array<unknown> = [];
    const file = new Blob(["front"], { type: "image/png" });
    const storage = createDancerDocumentStorage(
      createStorageAdapter({
        list: async (input) => {
          calls.push({ ...input, type: "list" });

          return [
            { name: "document-front.jpg" },
            { name: "document-front.webp" },
            { name: "document-back.jpg" },
            { name: "notes.txt" },
          ];
        },
        remove: async (input) => {
          calls.push({ ...input, type: "remove" });
        },
        upload: async (input) => {
          calls.push({ ...input, type: "upload" });
        },
      }),
    );

    expect(
      expectUploaded(
        await storage.uploadDocumentImage({
          academyId: "academy-1",
          dancerId: "dancer-1",
          file,
          side: "front",
        }),
      ),
    ).toBe("academies/academy-1/dancers/dancer-1/document-front.png");

    expect(calls).toEqual([
      {
        bucket: "en-escena-dancer-documents",
        prefix: "academies/academy-1/dancers/dancer-1",
        type: "list",
      },
      {
        bucket: "en-escena-dancer-documents",
        file,
        key: "academies/academy-1/dancers/dancer-1/document-front.png",
        options: {
          contentType: "image/png",
          upsert: true,
        },
        type: "upload",
      },
      {
        bucket: "en-escena-dancer-documents",
        keys: [
          "academies/academy-1/dancers/dancer-1/document-front.jpg",
          "academies/academy-1/dancers/dancer-1/document-front.webp",
        ],
        type: "remove",
      },
    ]);
  });

  test("creates a signed URL for a stored dancer document image", async () => {
    const signedUrlRequests: Array<{
      bucket: string;
      expiresInSeconds: number;
      key: string;
    }> = [];
    const storage = createDancerDocumentStorage(
      createStorageAdapter({
        createSignedUrl: async (input) => {
          signedUrlRequests.push(input);

          return "https://example.test/signed/document-front";
        },
      }),
    );

    const signedUrl = await storage.createDocumentImageSignedUrl(
      "academies/academy-1/dancers/dancer-1/document-front.jpg",
    );

    expect(signedUrl).toBe("https://example.test/signed/document-front");
    expect(signedUrlRequests).toEqual([
      {
        bucket: "en-escena-dancer-documents",
        expiresInSeconds: 300,
        key: "academies/academy-1/dancers/dancer-1/document-front.jpg",
      },
    ]);
  });

  test("stores documents on the local volume and serves them via a signed route", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "en-escena-docs-"));
    const secret = "volume-signing-secret";

    try {
      const storage = createFilesystemDancerDocumentStorage({
        baseDir,
        now: () => 1_000_000,
        secret,
      });

      const storageKey = expectUploaded(
        await storage.uploadDocumentImage({
          academyId: "academy-1",
          dancerId: "dancer-1",
          file: new Blob(["front"], { type: "image/jpeg" }),
          side: "front",
        }),
      );

      expect(storageKey).toBe(
        "academies/academy-1/dancers/dancer-1/document-front.jpg",
      );
      await expect(
        readFile(
          join(baseDir, "en-escena-dancer-documents", storageKey),
          "utf8",
        ),
      ).resolves.toBe("front");

      const signedUrl = await storage.createDocumentImageSignedUrl(storageKey);
      const params = new URL(signedUrl, "https://sistema.enescena.com.ar")
        .searchParams;

      const response = await serveFilesystemObject({
        baseDir,
        now: 1_000_000,
        params,
        secret,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/jpeg");
      expect(await response.text()).toBe("front");
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  test("replaces a prior document side on the volume regardless of extension", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "en-escena-docs-"));

    try {
      const storage = createFilesystemDancerDocumentStorage({
        baseDir,
        now: () => 1_000_000,
        secret: "volume-signing-secret",
      });

      await storage.uploadDocumentImage({
        academyId: "academy-1",
        dancerId: "dancer-1",
        file: new Blob(["old"], { type: "image/jpeg" }),
        side: "front",
      });
      await storage.uploadDocumentImage({
        academyId: "academy-1",
        dancerId: "dancer-1",
        file: new Blob(["new"], { type: "image/png" }),
        side: "front",
      });

      const folder = join(
        baseDir,
        "en-escena-dancer-documents",
        "academies/academy-1/dancers/dancer-1",
      );

      await expect(
        readFile(join(folder, "document-front.png"), "utf8"),
      ).resolves.toBe("new");
      await expect(
        readFile(join(folder, "document-front.jpg"), "utf8"),
      ).rejects.toThrow();
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });
});

describe("loadDancerDocumentImageUrls", () => {
  test("signs both sides through one store", async () => {
    const storage = createDancerDocumentStorage(
      createStorageAdapter({
        createSignedUrl: async (input) => `signed:${input.key}`,
      }),
    );

    await expect(
      loadDancerDocumentImageUrls({
        documentBackImageStorageKey: "academies/a/dancers/d/document-back.jpg",
        documentFrontImageStorageKey:
          "academies/a/dancers/d/document-front.jpg",
        storage,
      }),
    ).resolves.toEqual({
      back: "signed:academies/a/dancers/d/document-back.jpg",
      front: "signed:academies/a/dancers/d/document-front.jpg",
    });
  });

  // A dancer with only one side uploaded still shows the side that exists.
  test("yields no link for the absent side only", async () => {
    const storage = createDancerDocumentStorage(
      createStorageAdapter({
        createSignedUrl: async (input) => `signed:${input.key}`,
      }),
    );

    await expect(
      loadDancerDocumentImageUrls({
        documentBackImageStorageKey: null,
        documentFrontImageStorageKey:
          "academies/a/dancers/d/document-front.jpg",
        storage,
      }),
    ).resolves.toEqual({
      back: null,
      front: "signed:academies/a/dancers/d/document-front.jpg",
    });
  });

  test("yields no link when an object is unreachable rather than throwing", async () => {
    const storage = createDancerDocumentStorage(
      createStorageAdapter({
        createSignedUrl: async () => {
          throw new Error("volume unavailable");
        },
      }),
    );

    await expect(
      loadDancerDocumentImageUrls({
        documentBackImageStorageKey: "academies/a/dancers/d/document-back.jpg",
        documentFrontImageStorageKey:
          "academies/a/dancers/d/document-front.jpg",
        storage,
      }),
    ).resolves.toEqual({ back: null, front: null });
  });
});

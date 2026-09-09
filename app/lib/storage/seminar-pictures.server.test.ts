import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { serveFilesystemObject } from "./filesystem-client.server";
import {
  type SeminarPictureStorageAdapter,
  createFilesystemSeminarPictureStorage,
  createSeminarPictureStorage,
  loadSeminarInstructorPictureUrl,
} from "./seminar-pictures.server";

const bucket = "enescena-seminar-pictures";

function createStorageAdapter(
  overrides: Partial<SeminarPictureStorageAdapter>,
): SeminarPictureStorageAdapter {
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
      ReturnType<typeof createSeminarPictureStorage>["uploadInstructorPicture"]
    >
  >,
) {
  if (!result.ok) {
    throw new Error(`Expected an upload, got ${result.rejection.reason}`);
  }

  return result.storageKey;
}

describe("seminar picture storage", () => {
  test("uploads the picture to the canonical event-owned key", async () => {
    const uploads: Array<{ bucket: string; key: string }> = [];
    const storage = createSeminarPictureStorage(
      createStorageAdapter({
        upload: async (input) => {
          uploads.push({ bucket: input.bucket, key: input.key });
        },
      }),
    );

    const storageKey = expectUploaded(
      await storage.uploadInstructorPicture({
        eventId: "event-1",
        file: new Blob(["picture"], { type: "image/jpeg" }),
        seminarId: "seminar-1",
      }),
    );

    expect(storageKey).toBe("events/event-1/seminars/seminar-1/instructor.jpg");
    expect(uploads).toEqual([{ bucket, key: storageKey }]);
  });

  test("rejects an unsupported picture format before uploading", async () => {
    const uploads: unknown[] = [];
    const storage = createSeminarPictureStorage(
      createStorageAdapter({
        upload: async (input) => {
          uploads.push(input);
        },
      }),
    );

    expect(
      await storage.uploadInstructorPicture({
        eventId: "event-1",
        file: new Blob(["pdf"], { type: "application/pdf" }),
        seminarId: "seminar-1",
      }),
    ).toEqual({
      ok: false,
      rejection: {
        contentType: "application/pdf",
        kind: "seminarInstructorPicture",
        reason: "unsupported-content-type",
      },
    });
    expect(uploads).toEqual([]);
  });

  test("rejects a picture larger than 10 MB before uploading", async () => {
    const uploads: unknown[] = [];
    const storage = createSeminarPictureStorage(
      createStorageAdapter({
        upload: async (input) => {
          uploads.push(input);
        },
      }),
    );

    const sizeBytes = 10 * 1024 * 1024 + 1;

    expect(
      await storage.uploadInstructorPicture({
        eventId: "event-1",
        file: new Blob([new Uint8Array(sizeBytes)], { type: "image/png" }),
        seminarId: "seminar-1",
      }),
    ).toEqual({
      ok: false,
      rejection: {
        kind: "seminarInstructorPicture",
        reason: "file-too-large",
        sizeBytes,
      },
    });
    expect(uploads).toEqual([]);
  });

  // One object per seminar: anything under the prefix that is not the key about
  // to be written is the previous picture in another format.
  test("uploads before removing the sibling it replaces", async () => {
    const calls: unknown[] = [];
    const file = new Blob(["new"], { type: "image/png" });
    const storage = createSeminarPictureStorage(
      createStorageAdapter({
        list: async (input) => {
          calls.push({ ...input, type: "list" });

          return [{ name: "instructor.jpg" }, { name: "instructor.png" }];
        },
        remove: async (input) => {
          calls.push({ ...input, type: "remove" });
        },
        upload: async (input) => {
          calls.push({ bucket: input.bucket, key: input.key, type: "upload" });
        },
      }),
    );

    expect(
      expectUploaded(
        await storage.uploadInstructorPicture({
          eventId: "event-1",
          file,
          seminarId: "seminar-1",
        }),
      ),
    ).toBe("events/event-1/seminars/seminar-1/instructor.png");

    expect(calls).toEqual([
      { bucket, prefix: "events/event-1/seminars/seminar-1", type: "list" },
      {
        bucket,
        key: "events/event-1/seminars/seminar-1/instructor.png",
        type: "upload",
      },
      {
        bucket,
        keys: ["events/event-1/seminars/seminar-1/instructor.jpg"],
        type: "remove",
      },
    ]);
  });

  test("removes the stored picture object", async () => {
    const removals: Array<{ bucket: string; keys: string[] }> = [];
    const storage = createSeminarPictureStorage(
      createStorageAdapter({
        remove: async (input) => {
          removals.push(input);
        },
      }),
    );

    await storage.removeInstructorPicture(
      "events/event-1/seminars/seminar-1/instructor.jpg",
    );

    expect(removals).toEqual([
      {
        bucket,
        keys: ["events/event-1/seminars/seminar-1/instructor.jpg"],
      },
    ]);
  });

  test("signs a stored picture for the policy's window", async () => {
    const requests: Array<{ expiresInSeconds: number; key: string }> = [];
    const storage = createSeminarPictureStorage(
      createStorageAdapter({
        createSignedUrl: async (input) => {
          requests.push({
            expiresInSeconds: input.expiresInSeconds,
            key: input.key,
          });

          return "https://example.test/signed/instructor";
        },
      }),
    );

    await expect(
      storage.createInstructorPictureSignedUrl(
        "events/event-1/seminars/seminar-1/instructor.jpg",
      ),
    ).resolves.toBe("https://example.test/signed/instructor");
    expect(requests).toEqual([
      {
        expiresInSeconds: 300,
        key: "events/event-1/seminars/seminar-1/instructor.jpg",
      },
    ]);
  });

  test("stores the picture on the local volume and serves it via a signed route", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "en-escena-seminars-"));
    const secret = "volume-signing-secret";

    try {
      const storage = createFilesystemSeminarPictureStorage({
        baseDir,
        now: () => 1_000_000,
        secret,
      });

      const storageKey = expectUploaded(
        await storage.uploadInstructorPicture({
          eventId: "event-1",
          file: new Blob(["picture"], { type: "image/jpeg" }),
          seminarId: "seminar-1",
        }),
      );

      const signedUrl =
        await storage.createInstructorPictureSignedUrl(storageKey);
      const response = await serveFilesystemObject({
        baseDir,
        now: 1_000_000,
        params: new URL(signedUrl, "https://sistema.enescena.com.ar")
          .searchParams,
        secret,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/jpeg");
      expect(await response.text()).toBe("picture");
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  test("leaves exactly one object when a JPG is replaced by a PNG", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "en-escena-seminars-"));

    try {
      const storage = createFilesystemSeminarPictureStorage({
        baseDir,
        now: () => 1_000_000,
        secret: "volume-signing-secret",
      });

      await storage.uploadInstructorPicture({
        eventId: "event-1",
        file: new Blob(["old"], { type: "image/jpeg" }),
        seminarId: "seminar-1",
      });
      await storage.uploadInstructorPicture({
        eventId: "event-1",
        file: new Blob(["new"], { type: "image/png" }),
        seminarId: "seminar-1",
      });

      const folder = join(baseDir, bucket, "events/event-1/seminars/seminar-1");

      expect(await readdir(folder)).toEqual(["instructor.png"]);
      await expect(
        readFile(join(folder, "instructor.png"), "utf8"),
      ).resolves.toBe("new");
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  test("removing on the volume deletes the object and tolerates one already gone", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "en-escena-seminars-"));

    try {
      const storage = createFilesystemSeminarPictureStorage({
        baseDir,
        now: () => 1_000_000,
        secret: "volume-signing-secret",
      });

      const storageKey = expectUploaded(
        await storage.uploadInstructorPicture({
          eventId: "event-1",
          file: new Blob(["picture"], { type: "image/webp" }),
          seminarId: "seminar-1",
        }),
      );

      await storage.removeInstructorPicture(storageKey);
      await storage.removeInstructorPicture(storageKey);

      expect(
        await readdir(
          join(baseDir, bucket, "events/event-1/seminars/seminar-1"),
        ),
      ).toEqual([]);
    } finally {
      await rm(baseDir, { force: true, recursive: true });
    }
  });
});

describe("loadSeminarInstructorPictureUrl", () => {
  test("signs the stored key and reads an absent one as no picture", async () => {
    const storage = createSeminarPictureStorage(
      createStorageAdapter({
        createSignedUrl: async (input) => `signed:${input.key}`,
      }),
    );

    await expect(
      loadSeminarInstructorPictureUrl({
        instructorPictureStorageKey:
          "events/event-1/seminars/seminar-1/instructor.jpg",
        storage,
      }),
    ).resolves.toBe("signed:events/event-1/seminars/seminar-1/instructor.jpg");

    await expect(
      loadSeminarInstructorPictureUrl({
        instructorPictureStorageKey: null,
        storage,
      }),
    ).resolves.toBeNull();
  });
});

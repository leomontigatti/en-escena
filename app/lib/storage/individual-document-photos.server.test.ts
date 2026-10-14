import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  createFilesystemIndividualDocumentPhotoStorage,
  createIndividualDocumentPhotoStorage,
  loadIndividualDocumentPhotoUrl,
} from "./individual-document-photos.server";

const bucket = "en-escena-individual-documents";

let baseDir = "";

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "en-escena-individual-photos-"));
});

afterEach(async () => {
  await rm(baseDir, { force: true, recursive: true });
});

function createStorage() {
  return createFilesystemIndividualDocumentPhotoStorage({
    baseDir,
    now: () => 1_000_000,
    secret: "volume-signing-secret",
  });
}

describe("individual document photo storage", () => {
  test("stores each upload under a new key in the individual's folder", async () => {
    const storage = createStorage();

    const first = await storage.uploadDocumentPhoto({
      file: new Blob(["first"], { type: "image/jpeg" }),
      individualId: "individual-1",
    });
    const second = await storage.uploadDocumentPhoto({
      file: new Blob(["second"], { type: "image/jpeg" }),
      individualId: "individual-1",
    });

    expect(first.ok && first.storageKey).toMatch(
      /^individuals\/individual-1\/document-.+\.jpg$/,
    );
    expect(second.ok && second.storageKey).not.toBe(
      first.ok && first.storageKey,
    );
    await expect(
      readdir(join(baseDir, bucket, "individuals", "individual-1")),
    ).resolves.toHaveLength(2);
  });

  test("refuses a file outside the policy and writes nothing", async () => {
    const storage = createStorage();

    await expect(
      storage.uploadDocumentPhoto({
        file: new Blob(["%PDF"], { type: "application/pdf" }),
        individualId: "individual-1",
      }),
    ).resolves.toEqual({
      ok: false,
      rejection: {
        contentType: "application/pdf",
        kind: "individualDocumentPhoto",
        reason: "unsupported-content-type",
      },
    });
    await expect(readdir(baseDir)).resolves.toEqual([]);
  });

  test("reads an unreachable photo as no photo", async () => {
    const storage = createIndividualDocumentPhotoStorage({
      createSignedUrl: async () => {
        throw new Error("volume unreachable");
      },
      remove: async () => {},
      upload: async () => {},
    });

    await expect(
      loadIndividualDocumentPhotoUrl({
        documentPhotoStorageKey: "individuals/individual-1/document-a.jpg",
        storage,
      }),
    ).resolves.toBeNull();
  });
});

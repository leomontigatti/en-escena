import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  type EventDocumentStorageAdapter,
  createEventDocumentStorage,
  createFilesystemEventDocumentStorage,
  loadEventDocumentDownloadUrl,
} from "./event-documents.server";
import { serveFilesystemObject } from "./filesystem-client.server";

const SECRET = "test-signing-secret";

function createStorageAdapter(
  overrides: Partial<EventDocumentStorageAdapter>,
): EventDocumentStorageAdapter {
  return {
    createSignedUrl: async () => "https://example.test/signed",
    remove: async () => {},
    upload: async () => {},
    ...overrides,
  };
}

describe("event document storage", () => {
  test("uploads to a key that is stable per event and kind", async () => {
    const uploads: Array<{
      bucket: string;
      key: string;
      options: { contentType: string; upsert: boolean };
    }> = [];
    const storage = createEventDocumentStorage(
      createStorageAdapter({
        upload: async (input) => {
          uploads.push(input);
        },
      }),
    );

    const result = await storage.uploadDocument({
      eventId: "event-1",
      file: new Blob(["pdf"], { type: "application/pdf" }),
      kind: "minor_authorization",
    });

    expect(result).toEqual({
      ok: true,
      storageKey: "events/event-1/documents/minor_authorization.pdf",
    });
    expect(uploads).toEqual([
      {
        bucket: "en-escena-event-documents",
        file: expect.anything(),
        key: "events/event-1/documents/minor_authorization.pdf",
        options: { contentType: "application/pdf", upsert: true },
      },
    ]);
  });

  test("refuses a file the policy does not accept, without touching the store", async () => {
    let uploadCount = 0;
    const storage = createEventDocumentStorage(
      createStorageAdapter({
        upload: async () => {
          uploadCount += 1;
        },
      }),
    );

    const result = await storage.uploadDocument({
      eventId: "event-1",
      file: new Blob(["not a pdf"], { type: "image/png" }),
      kind: "adult_contract",
    });

    expect(result).toEqual({
      ok: false,
      rejection: {
        contentType: "image/png",
        kind: "eventDocument",
        reason: "unsupported-content-type",
      },
    });
    expect(uploadCount).toBe(0);
  });

  test("signs a read with the download filename of the kind", async () => {
    const requests: Array<{ filename: string; key: string }> = [];
    const storage = createEventDocumentStorage(
      createStorageAdapter({
        createSignedUrl: async (input) => {
          requests.push({ filename: input.filename, key: input.key });

          return "https://example.test/signed";
        },
      }),
    );

    await loadEventDocumentDownloadUrl({
      kind: "professor_contract",
      storage,
      storageKey: "events/event-1/documents/professor_contract.pdf",
    });

    expect(requests).toEqual([
      {
        filename: "contrato-para-profesores.pdf",
        key: "events/event-1/documents/professor_contract.pdf",
      },
    ]);
  });

  test("answers null for an event with no document of that kind", async () => {
    const storage = createEventDocumentStorage(createStorageAdapter({}));

    await expect(
      loadEventDocumentDownloadUrl({
        kind: "professor_contract",
        storage,
        storageKey: null,
      }),
    ).resolves.toBeNull();
  });
});

describe("event documents on the volume", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "en-escena-event-documents-"));
  });

  afterEach(async () => {
    await rm(baseDir, { force: true, recursive: true });
  });

  test("round-trips the bytes through the signed route under its filename", async () => {
    const storage = createFilesystemEventDocumentStorage({
      baseDir,
      now: () => 1_000_000,
      secret: SECRET,
    });

    const uploaded = await storage.uploadDocument({
      eventId: "event-1",
      file: new Blob(["pdf-bytes"], { type: "application/pdf" }),
      kind: "adult_contract",
    });

    if (!uploaded.ok) {
      throw new Error("Expected the upload to be accepted");
    }

    const signedUrl = await storage.createDocumentSignedUrl({
      kind: "adult_contract",
      storageKey: uploaded.storageKey,
    });
    const response = await serveFilesystemObject({
      baseDir,
      now: 1_000_000,
      params: new URL(signedUrl, "https://sistema.enescena.com.ar")
        .searchParams,
      secret: SECRET,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'inline; filename="contrato-para-mayores.pdf"',
    );
    expect(await response.text()).toBe("pdf-bytes");
  });

  test("a replace overwrites the object instead of orphaning it", async () => {
    const storage = createFilesystemEventDocumentStorage({
      baseDir,
      now: () => 1_000_000,
      secret: SECRET,
    });

    const first = await storage.uploadDocument({
      eventId: "event-1",
      file: new Blob(["old"], { type: "application/pdf" }),
      kind: "professor_contract",
    });
    const second = await storage.uploadDocument({
      eventId: "event-1",
      file: new Blob(["new"], { type: "application/pdf" }),
      kind: "professor_contract",
    });

    expect(first).toEqual(second);

    const signedUrl = await storage.createDocumentSignedUrl({
      kind: "professor_contract",
      storageKey: "events/event-1/documents/professor_contract.pdf",
    });
    const response = await serveFilesystemObject({
      baseDir,
      now: 1_000_000,
      params: new URL(signedUrl, "https://sistema.enescena.com.ar")
        .searchParams,
      secret: SECRET,
    });

    expect(await response.text()).toBe("new");
  });

  test("removes the object a delete points at", async () => {
    const storage = createFilesystemEventDocumentStorage({
      baseDir,
      now: () => 1_000_000,
      secret: SECRET,
    });
    await storage.uploadDocument({
      eventId: "event-1",
      file: new Blob(["pdf-bytes"], { type: "application/pdf" }),
      kind: "minor_authorization",
    });

    await storage.removeDocument(
      "events/event-1/documents/minor_authorization.pdf",
    );

    const signedUrl = await storage.createDocumentSignedUrl({
      kind: "minor_authorization",
      storageKey: "events/event-1/documents/minor_authorization.pdf",
    });
    const response = await serveFilesystemObject({
      baseDir,
      now: 1_000_000,
      params: new URL(signedUrl, "https://sistema.enescena.com.ar")
        .searchParams,
      secret: SECRET,
    });

    expect(response.status).toBe(404);
  });
});

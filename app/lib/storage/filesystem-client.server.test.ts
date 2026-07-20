import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  createFilesystemSignedUrl,
  fsList,
  fsReadObject,
  fsRemove,
  fsUpload,
  getRequiredFilesystemStorageEnv,
  mintStorageAccessToken,
  serveFilesystemObject,
} from "./filesystem-client.server";

const SECRET = "test-signing-secret";

describe("filesystem storage env", () => {
  test("requires each filesystem storage variable", () => {
    expect(() =>
      getRequiredFilesystemStorageEnv("STORAGE_VOLUME_DIR", {}),
    ).toThrow("STORAGE_VOLUME_DIR is required.");
    expect(
      getRequiredFilesystemStorageEnv("STORAGE_VOLUME_DIR", {
        STORAGE_VOLUME_DIR: "/var/lib/en-escena/storage",
      }),
    ).toBe("/var/lib/en-escena/storage");
  });
});

describe("filesystem storage operations", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "en-escena-storage-"));
  });

  afterEach(async () => {
    await rm(baseDir, { force: true, recursive: true });
  });

  test("uploads an object under bucket/key preserving the key intact", async () => {
    await fsUpload({
      baseDir,
      bucket: "en-escena-dancer-documents",
      file: new Blob(["front"], { type: "image/jpeg" }),
      key: "academies/academy-1/dancers/dancer-1/document-front.jpg",
    });

    const contents = await readFile(
      join(
        baseDir,
        "en-escena-dancer-documents",
        "academies/academy-1/dancers/dancer-1/document-front.jpg",
      ),
      "utf8",
    );

    expect(contents).toBe("front");
  });

  test("upload overwrites an existing object at the same key", async () => {
    const key = "academies/academy-1/choreographies/c-1/music.mp3";

    await fsUpload({
      baseDir,
      bucket: "en-escena-choreography-music",
      file: new Blob(["old"], { type: "audio/mpeg" }),
      key,
    });
    await fsUpload({
      baseDir,
      bucket: "en-escena-choreography-music",
      file: new Blob(["new"], { type: "audio/mpeg" }),
      key,
    });

    const bytes = await fsReadObject({
      baseDir,
      bucket: "en-escena-choreography-music",
      key,
    });

    expect(new TextDecoder().decode(bytes ?? new Uint8Array())).toBe("new");
  });

  test("lists only the immediate files under a prefix", async () => {
    const bucket = "en-escena-dancer-documents";
    const folder = "academies/academy-1/dancers/dancer-1";

    await fsUpload({
      baseDir,
      bucket,
      file: new Blob(["a"], { type: "image/jpeg" }),
      key: `${folder}/document-front.jpg`,
    });
    await fsUpload({
      baseDir,
      bucket,
      file: new Blob(["b"], { type: "image/webp" }),
      key: `${folder}/document-back.webp`,
    });
    await fsUpload({
      baseDir,
      bucket,
      file: new Blob(["c"], { type: "image/png" }),
      key: `${folder}/nested/deeper.png`,
    });

    const files = await fsList({ baseDir, bucket, prefix: folder });

    expect(files.map((file) => file.name).sort()).toEqual([
      "document-back.webp",
      "document-front.jpg",
    ]);
  });

  test("lists nothing for a prefix that does not exist yet", async () => {
    const files = await fsList({
      baseDir,
      bucket: "en-escena-dancer-documents",
      prefix: "academies/unknown/dancers/nobody",
    });

    expect(files).toEqual([]);
  });

  test("removes the requested keys and ignores missing ones", async () => {
    const bucket = "en-escena-dancer-documents";
    const key = "academies/academy-1/dancers/dancer-1/document-front.jpg";

    await fsUpload({
      baseDir,
      bucket,
      file: new Blob(["front"], { type: "image/jpeg" }),
      key,
    });

    await fsRemove({
      baseDir,
      bucket,
      keys: [key, "academies/academy-1/dancers/dancer-1/does-not-exist.jpg"],
    });

    expect(await fsReadObject({ baseDir, bucket, key })).toBeNull();
  });

  test("rejects keys that try to escape the bucket directory", async () => {
    await expect(
      fsUpload({
        baseDir,
        bucket: "en-escena-dancer-documents",
        file: new Blob(["x"], { type: "image/jpeg" }),
        key: "../../etc/passwd",
      }),
    ).rejects.toThrow("Invalid storage key");
  });
});

describe("short-lived storage access tokens", () => {
  test("builds a same-origin signed route that carries a verifiable token", () => {
    const url = createFilesystemSignedUrl({
      bucket: "en-escena-dancer-documents",
      expiresInSeconds: 300,
      key: "academies/academy-1/dancers/dancer-1/document-front.jpg",
      now: 1_000_000,
      secret: SECRET,
    });

    const parsed = new URL(url, "https://sistema.enescena.com.ar");

    expect(parsed.pathname).toBe("/almacenamiento");
    expect(parsed.searchParams.get("bucket")).toBe(
      "en-escena-dancer-documents",
    );
    expect(parsed.searchParams.get("key")).toBe(
      "academies/academy-1/dancers/dancer-1/document-front.jpg",
    );
    expect(parsed.searchParams.get("expires")).toBe("1300");
    expect(parsed.searchParams.get("token")).toBe(
      mintStorageAccessToken({
        bucket: "en-escena-dancer-documents",
        expiresAt: 1300,
        key: "academies/academy-1/dancers/dancer-1/document-front.jpg",
        secret: SECRET,
      }),
    );
  });
});

describe("serving objects from the volume", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "en-escena-serve-"));
  });

  afterEach(async () => {
    await rm(baseDir, { force: true, recursive: true });
  });

  async function seed(bucket: string, key: string, body: string) {
    await fsUpload({
      baseDir,
      bucket,
      file: new Blob([body], { type: "application/octet-stream" }),
      key,
    });
  }

  function signedParams(input: {
    bucket: string;
    expiresAt: number;
    key: string;
  }) {
    return new URLSearchParams({
      bucket: input.bucket,
      expires: String(input.expiresAt),
      key: input.key,
      token: mintStorageAccessToken({ ...input, secret: SECRET }),
    });
  }

  test("streams the bytes with a private cache policy for a valid token", async () => {
    const bucket = "en-escena-dancer-documents";
    const key = "academies/academy-1/dancers/dancer-1/document-front.jpg";
    await seed(bucket, key, "front-bytes");

    const response = await serveFilesystemObject({
      baseDir,
      now: 1_290_000,
      params: signedParams({ bucket, expiresAt: 1300, key }),
      secret: SECRET,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("front-bytes");
  });

  test("rejects an expired token", async () => {
    const bucket = "en-escena-dancer-documents";
    const key = "academies/academy-1/dancers/dancer-1/document-front.jpg";
    await seed(bucket, key, "front-bytes");

    const response = await serveFilesystemObject({
      baseDir,
      now: 1_400_000,
      params: signedParams({ bucket, expiresAt: 1300, key }),
      secret: SECRET,
    });

    expect(response.status).toBe(403);
  });

  test("rejects a tampered token", async () => {
    const bucket = "en-escena-dancer-documents";
    const key = "academies/academy-1/dancers/dancer-1/document-front.jpg";
    await seed(bucket, key, "front-bytes");

    const params = signedParams({ bucket, expiresAt: 1300, key });
    params.set("key", "academies/academy-1/dancers/dancer-1/document-back.jpg");

    const response = await serveFilesystemObject({
      baseDir,
      now: 1_290_000,
      params,
      secret: SECRET,
    });

    expect(response.status).toBe(403);
  });

  test("returns 404 when the token is valid but the object is gone", async () => {
    const bucket = "en-escena-dancer-documents";
    const key = "academies/academy-1/dancers/dancer-1/document-front.jpg";

    const response = await serveFilesystemObject({
      baseDir,
      now: 1_290_000,
      params: signedParams({ bucket, expiresAt: 1300, key }),
      secret: SECRET,
    });

    expect(response.status).toBe(404);
  });
});

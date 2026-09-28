import { createHmac, timingSafeEqual } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FileHandle } from "node:fs/promises";

// Storage lives on a Coolify volume co-located with the app in São Paulo. The
// live byte store is this local volume; B2 is relegated to backups. Keys stay
// intact (`academies/...`) so a re-seed from the B2 backup is a plain copy.
type FilesystemStorageEnvName =
  "STORAGE_URL_SIGNING_SECRET" | "STORAGE_VOLUME_DIR";

const STORAGE_SERVE_ROUTE_PATH = "/almacenamiento";

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  aac: "audio/aac",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  pdf: "application/pdf",
  png: "image/png",
  wav: "audio/wav",
  webp: "image/webp",
};

/**
 * The adapter a private asset kind stores through: the seam ADR-0008 asked for,
 * kept so a future provider is a new implementation rather than a rewrite.
 * Signing is not optional: the one live store always signs (#571).
 */
export type SignedObjectStorageAdapter = {
  createSignedUrl(input: {
    bucket: string;
    expiresInSeconds: number;
    key: string;
  }): Promise<string>;
  remove(input: { bucket: string; keys: string[] }): Promise<void>;
  upload(input: {
    bucket: string;
    file: Blob;
    key: string;
    options: {
      contentType: string;
      upsert: boolean;
    };
  }): Promise<void>;
};

/** That adapter over the local volume, the one implementation there is. */
export function createFilesystemObjectStorageAdapter(deps: {
  baseDir: string;
  now?: () => number;
  secret: string;
}): SignedObjectStorageAdapter {
  const now = deps.now ?? Date.now;

  return {
    createSignedUrl: async (input) =>
      createFilesystemSignedUrl({
        bucket: input.bucket,
        expiresInSeconds: input.expiresInSeconds,
        key: input.key,
        now: now(),
        secret: deps.secret,
      }),
    remove: (input) =>
      fsRemove({
        baseDir: deps.baseDir,
        bucket: input.bucket,
        keys: input.keys,
      }),
    upload: (input) =>
      fsUpload({
        baseDir: deps.baseDir,
        bucket: input.bucket,
        file: input.file,
        key: input.key,
      }),
  };
}

export function getRequiredFilesystemStorageEnv(
  name: FilesystemStorageEnvName,
  env: NodeJS.ProcessEnv,
) {
  const value = env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function getDefaultStorageVolumeDir(
  env: NodeJS.ProcessEnv = process.env,
) {
  return getRequiredFilesystemStorageEnv("STORAGE_VOLUME_DIR", env);
}

export function getDefaultStorageUrlSigningSecret(
  env: NodeJS.ProcessEnv = process.env,
) {
  return getRequiredFilesystemStorageEnv("STORAGE_URL_SIGNING_SECRET", env);
}

export async function fsUpload(input: {
  baseDir: string;
  bucket: string;
  file: Blob;
  key: string;
}) {
  const target = resolveObjectPath(input);
  const body = new Uint8Array(await input.file.arrayBuffer());

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, body);
}

export async function fsRemove(input: {
  baseDir: string;
  bucket: string;
  keys: string[];
}) {
  for (const key of input.keys) {
    const target = resolveObjectPath({
      baseDir: input.baseDir,
      bucket: input.bucket,
      key,
    });

    await rm(target, { force: true });
  }
}

export async function fsList(input: {
  baseDir: string;
  bucket: string;
  prefix: string;
}): Promise<Array<{ name: string }>> {
  const dir = resolveObjectPath({
    baseDir: input.baseDir,
    bucket: input.bucket,
    key: input.prefix,
  });

  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }

    throw error;
  }

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => ({ name: entry.name }));
}

export async function fsReadObject(input: {
  baseDir: string;
  bucket: string;
  key: string;
}): Promise<Uint8Array<ArrayBuffer> | null> {
  const target = resolveObjectPath(input);

  try {
    const data = await readFile(target);
    const bytes = new Uint8Array(data.byteLength);

    bytes.set(data);

    return bytes;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

export function mintStorageAccessToken(input: {
  bucket: string;
  expiresAt: number;
  filename?: string;
  key: string;
  secret: string;
}) {
  // The filename is part of the signed payload, never read straight off the
  // query string: it is echoed into a response header, so an unsigned one is a
  // response-header-injection surface. A URL minted without a filename keeps
  // its original payload, so links already in flight stay valid.
  const payload = input.filename
    ? `${input.bucket}\n${input.key}\n${input.expiresAt}\n${input.filename}`
    : `${input.bucket}\n${input.key}\n${input.expiresAt}`;

  return createHmac("sha256", input.secret).update(payload).digest("hex");
}

// The old presigned S3 URL is replaced by a same-origin route guarded by a
// short-lived HMAC token. The route serves PII, so the edge/CDN must not cache
// it — we accept the lost caching because these bytes were never cacheable.
export function createFilesystemSignedUrl(input: {
  bucket: string;
  expiresInSeconds: number;
  /**
   * The name the browser saves the object under. Optional: without it the
   * response carries no `Content-Disposition` and the browser derives a name
   * from the route, which is all an image preview or an audio player needs.
   */
  filename?: string;
  key: string;
  now: number;
  routePath?: string;
  secret: string;
}) {
  const expiresAt = Math.floor(input.now / 1000) + input.expiresInSeconds;

  if (input.filename !== undefined) {
    assertSafeFilename(input.filename);
  }

  const params = new URLSearchParams({
    bucket: input.bucket,
    expires: String(expiresAt),
    key: input.key,
    token: mintStorageAccessToken({
      bucket: input.bucket,
      expiresAt,
      filename: input.filename,
      key: input.key,
      secret: input.secret,
    }),
  });

  if (input.filename) {
    params.set("filename", input.filename);
  }

  return `${input.routePath ?? STORAGE_SERVE_ROUTE_PATH}?${params.toString()}`;
}

export async function serveFilesystemObject(input: {
  baseDir: string;
  now: number;
  params: URLSearchParams;
  /** The request's `Range` header, which an `<audio>` element sends to seek. */
  range?: string | null;
  secret: string;
}): Promise<Response> {
  const bucket = input.params.get("bucket");
  const key = input.params.get("key");
  const expiresAt = Number(input.params.get("expires"));
  const token = input.params.get("token");
  const filename = input.params.get("filename") ?? undefined;

  if (!bucket || !key || !token || !Number.isFinite(expiresAt)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (expiresAt * 1000 < input.now) {
    return new Response("Forbidden", { status: 403 });
  }

  // A filename that was not part of the signed payload fails here, so a
  // tampered one never reaches the response headers.
  const expected = mintStorageAccessToken({
    bucket,
    expiresAt,
    filename,
    key,
    secret: input.secret,
  });

  if (!timingSafeEqualHex(expected, token)) {
    return new Response("Forbidden", { status: 403 });
  }

  let target: string;

  try {
    target = resolveObjectPath({ baseDir: input.baseDir, bucket, key });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  let handle: FileHandle;

  try {
    handle = await open(target, "r");
  } catch (error) {
    if (isNotFoundError(error)) {
      return new Response("Not Found", { status: 404 });
    }

    return new Response("Forbidden", { status: 403 });
  }

  try {
    const size = (await handle.stat()).size;

    // These bytes are now served from the app's own origin (previously they
    // came from B2/Supabase, a separate origin). The stored Content-Type is
    // derived from the client-declared upload type, so `nosniff` keeps a
    // browser from reinterpreting an object as active content inside the app
    // origin.
    const headers: Record<string, string> = {
      "Cache-Control": "private, no-store",
      "Content-Type": getContentType(key),
      "X-Content-Type-Options": "nosniff",
    };

    // `inline` rather than `attachment`: a PDF should open in the browser, and
    // the name only decides what a save-as writes.
    if (filename) {
      headers["Content-Disposition"] = `inline; filename="${filename}"`;
    }

    // A player seeks by asking for a range, so it has to know it may.
    headers["Accept-Ranges"] = "bytes";

    const range = input.range ? parseByteRange(input.range, size) : null;

    if (range === "unsatisfiable") {
      return new Response(null, {
        headers: { ...headers, "Content-Range": `bytes */${size}` },
        status: 416,
      });
    }

    if (range) {
      const length = range.end - range.start + 1;
      const buffer = Buffer.alloc(length);

      // Only the requested slice is read off disk: a scrubber jumping around a
      // long recording never pulls the whole object into memory just to answer
      // one seek.
      await handle.read(buffer, 0, length, range.start);

      headers["Content-Length"] = String(length);
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;

      return new Response(buffer, { headers, status: 206 });
    }

    const data = await handle.readFile();

    return new Response(data, { headers, status: 200 });
  } catch {
    return new Response("Forbidden", { status: 403 });
  } finally {
    await handle.close();
  }
}

type ByteRange = "unsatisfiable" | { end: number; start: number } | null;

/**
 * A single `bytes=start-end` range, inclusive on both ends as the header is.
 * `null` is a header the route does not honour, answered with the whole
 * object; several ranges at once land there, since no player asks for them.
 */
function parseByteRange(header: string, size: number): ByteRange {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());

  if (!match || (!match[1] && !match[2])) {
    return null;
  }

  return match[1]
    ? resolveBoundedRange(Number(match[1]), match[2], size)
    : resolveSuffixRange(Number(match[2]), size);
}

/** No start is a suffix: the last that many bytes. */
function resolveSuffixRange(length: number, size: number): ByteRange {
  return length > 0 && size > 0
    ? { end: size - 1, start: Math.max(0, size - length) }
    : "unsatisfiable";
}

/**
 * An open end is what a browser sends to seek: from there to the last byte. An
 * end past the object is cut to it, as the header's grammar allows.
 */
function resolveBoundedRange(
  start: number,
  last: string | undefined,
  size: number,
): ByteRange {
  if (start >= size) {
    return "unsatisfiable";
  }

  const end = last ? Number(last) : size - 1;

  if (end < start) {
    return null;
  }

  return { end: Math.min(end, size - 1), start };
}

/**
 * ASCII, no quotes and no control characters, so the name survives a
 * `filename=` parameter without the RFC 5987 `filename*` encoding. Enforced at
 * minting time, where a bad name is a programming error rather than input.
 */
function assertSafeFilename(filename: string) {
  if (!/^[\w .()-]+$/.test(filename)) {
    throw new Error(`Invalid storage filename: ${filename}`);
  }
}

function getContentType(key: string) {
  const extension = key.split(".").pop()?.toLowerCase() ?? "";

  return CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";
}

function resolveObjectPath(input: {
  baseDir: string;
  bucket: string;
  key: string;
}) {
  assertSafeSegment(input.bucket);
  assertSafeKey(input.key);

  return join(input.baseDir, input.bucket, input.key);
}

function assertSafeKey(key: string) {
  if (!key || key.startsWith("/")) {
    throw new Error(`Invalid storage key: ${key}`);
  }

  for (const segment of key.split("/")) {
    assertSafeSegment(segment);
  }
}

function assertSafeSegment(segment: string) {
  if (!segment || segment === "." || segment === "..") {
    throw new Error(`Invalid storage key: ${segment}`);
  }
}

function timingSafeEqualHex(expected: string, provided: string) {
  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function isNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

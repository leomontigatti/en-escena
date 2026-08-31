import {
  getEventDocumentDeclaration,
  type EventDocumentKind,
} from "@/lib/events/event-documents";
import {
  type AssetKind,
  type UploadResult,
  getAssetKindPolicy,
  resolveAssetUpload,
} from "@/lib/storage/asset-kinds";
import { loadOptionalAssetDownloadUrl } from "@/lib/storage/asset-download-url";
import {
  createFilesystemSignedUrl,
  fsRemove,
  fsUpload,
  getDefaultStorageUrlSigningSecret,
  getDefaultStorageVolumeDir,
} from "@/lib/storage/filesystem-client.server";

const ASSET_KIND: AssetKind = "eventDocument";

type UploadEventDocumentInput = {
  eventId: string;
  file: Blob;
  kind: EventDocumentKind;
};

// The seam ADR-0008 asked for, kept so a future provider is a new
// implementation rather than a rewrite. Signing is not optional: the one live
// store always signs, so there is no "cannot sign" branch to defend (#571).
// These bytes are not PII — the same file goes to every academy — so signing
// buys no secrecy here; it is reused because an unsigned read would mean a
// second serve route with its own auth decision.
export type EventDocumentStorageAdapter = {
  createSignedUrl(input: {
    bucket: string;
    expiresInSeconds: number;
    filename: string;
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

// Live storage is the local Coolify volume in São Paulo. B2 is a backup
// destination reached by the shell scripts, never by the app.
export function createDefaultEventDocumentStorage(
  env: NodeJS.ProcessEnv = process.env,
) {
  return createFilesystemEventDocumentStorage({
    baseDir: getDefaultStorageVolumeDir(env),
    secret: getDefaultStorageUrlSigningSecret(env),
  });
}

export function createEventDocumentStorage(
  adapter: EventDocumentStorageAdapter,
) {
  const policy = getAssetKindPolicy(ASSET_KIND);

  return {
    async createDocumentSignedUrl(input: {
      kind: EventDocumentKind;
      storageKey: string;
    }) {
      return adapter.createSignedUrl({
        bucket: policy.bucket,
        expiresInSeconds: policy.signedUrlExpiresInSeconds,
        filename: getEventDocumentDeclaration(input.kind).downloadFileName,
        key: input.storageKey,
      });
    },

    async removeDocument(storageKey: string) {
      await adapter.remove({
        bucket: policy.bucket,
        keys: [storageKey],
      });
    },

    async uploadDocument(
      input: UploadEventDocumentInput,
    ): Promise<UploadResult> {
      const resolution = resolveAssetUpload(ASSET_KIND, input.file);

      if (!resolution.ok) {
        return { ok: false, rejection: resolution.rejection };
      }

      const storageKey = buildEventDocumentStorageKey(
        input,
        resolution.extension,
      );

      // The key is stable per `(eventId, kind)`, so a replace overwrites the
      // bytes instead of orphaning them. The 300s expiry makes the window in
      // which a link minted before the swap serves the new bytes negligible.
      await adapter.upload({
        bucket: policy.bucket,
        file: input.file,
        key: storageKey,
        options: {
          contentType: input.file.type,
          upsert: true,
        },
      });

      return { ok: true, storageKey };
    },
  };
}

export type EventDocumentStorage = ReturnType<
  typeof createEventDocumentStorage
>;

/** The one event-document read path, shared by the administration and the portal. */
export async function loadEventDocumentDownloadUrl(input: {
  kind: EventDocumentKind;
  storage: EventDocumentStorage;
  storageKey: string | null;
}) {
  return loadOptionalAssetDownloadUrl({
    createSignedUrl: (storageKey) =>
      input.storage.createDocumentSignedUrl({ kind: input.kind, storageKey }),
    storageKey: input.storageKey,
  });
}

export function createFilesystemEventDocumentStorage(deps: {
  baseDir: string;
  now?: () => number;
  secret: string;
}) {
  const now = deps.now ?? Date.now;

  return createEventDocumentStorage({
    createSignedUrl: async (input) =>
      createFilesystemSignedUrl({
        bucket: input.bucket,
        expiresInSeconds: input.expiresInSeconds,
        filename: input.filename,
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
  });
}

// The extension is passed in rather than looked up again: only the accepted
// path reaches here, and taking it as an argument makes that unrepresentable
// otherwise instead of a `professor_contract.null` key nobody would notice.
function buildEventDocumentStorageKey(
  input: UploadEventDocumentInput,
  extension: string,
) {
  return `events/${input.eventId}/documents/${input.kind}.${extension}`;
}

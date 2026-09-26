import {
  eventDocumentDeclarations,
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
  createFilesystemObjectStorageAdapter,
  getDefaultStorageUrlSigningSecret,
  getDefaultStorageVolumeDir,
  type SignedObjectStorageAdapter,
} from "@/lib/storage/filesystem-client.server";

const ASSET_KIND: AssetKind = "eventDocument";

type UploadEventDocumentInput = {
  eventId: string;
  file: Blob;
  kind: EventDocumentKind;
};

// These bytes are not PII — the same file goes to every academy — so signing
// buys no secrecy here; it is reused because an unsigned read would mean a
// second serve route with its own auth decision.
export type EventDocumentStorageAdapter = Omit<
  SignedObjectStorageAdapter,
  "createSignedUrl"
> & {
  createSignedUrl(input: {
    bucket: string;
    expiresInSeconds: number;
    filename: string;
    key: string;
  }): Promise<string>;
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
        filename: eventDocumentDeclarations[input.kind].downloadFileName,
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
    ...createFilesystemObjectStorageAdapter(deps),
    createSignedUrl: async (input) =>
      createFilesystemSignedUrl({
        bucket: input.bucket,
        expiresInSeconds: input.expiresInSeconds,
        filename: input.filename,
        key: input.key,
        now: now(),
        secret: deps.secret,
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

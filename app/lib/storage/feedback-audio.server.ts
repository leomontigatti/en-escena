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

const ASSET_KIND: AssetKind = "feedbackAudio";

type UploadFeedbackAudioInput = {
  eventId: string;
  file: Blob;
  judgeId: string;
  presentationId: string;
};

// The seam ADR-0008 asked for, kept so a future provider is a new
// implementation rather than a rewrite. Same shape as the choreography music
// adapter; unlike the seminar picture one it never lists, because a take's key
// is unique per upload and the previous one is known from the score row.
export type FeedbackAudioStorageAdapter = {
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

type FeedbackAudioStorageDeps = {
  /** Injected so a test can pin a key; production wants nothing but randomness. */
  uniqueSuffix?: () => string;
};

// Live storage is the local Coolify volume in São Paulo. B2 is a backup
// destination reached by the shell scripts, never by the app.
export function createDefaultFeedbackAudioStorage(
  env: NodeJS.ProcessEnv = process.env,
) {
  return createFilesystemFeedbackAudioStorage({
    baseDir: getDefaultStorageVolumeDir(env),
    secret: getDefaultStorageUrlSigningSecret(env),
  });
}

export function createFeedbackAudioStorage(
  adapter: FeedbackAudioStorageAdapter,
  deps: FeedbackAudioStorageDeps = {},
) {
  const policy = getAssetKindPolicy(ASSET_KIND);
  const uniqueSuffix = deps.uniqueSuffix ?? (() => crypto.randomUUID());

  return {
    async createFeedbackAudioSignedUrl(storageKey: string) {
      return adapter.createSignedUrl({
        bucket: policy.bucket,
        expiresInSeconds: policy.signedUrlExpiresInSeconds,
        key: storageKey,
      });
    },

    /** Tolerates an object that is already gone, so a retry converges. */
    async removeFeedbackAudio(storageKey: string) {
      await adapter.remove({ bucket: policy.bucket, keys: [storageKey] });
    },

    async uploadFeedbackAudio(
      input: UploadFeedbackAudioInput,
    ): Promise<UploadResult> {
      const resolution = resolveAssetUpload(ASSET_KIND, input.file);

      if (!resolution.ok) {
        return { ok: false, rejection: resolution.rejection };
      }

      const storageKey = buildFeedbackAudioStorageKey(
        input,
        uniqueSuffix(),
        resolution.extension,
      );

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

export type FeedbackAudioStorage = ReturnType<
  typeof createFeedbackAudioStorage
>;

/**
 * The one `Devolución` read path. A score without a take and one whose object
 * cannot be reached both read as "no audio", so a broken object cannot blank
 * the judge's list or, later, the academy's evaluation detail.
 */
export async function loadFeedbackAudioDownloadUrl(input: {
  storage: FeedbackAudioStorage;
  storageKey: string | null;
}) {
  return loadOptionalAssetDownloadUrl({
    createSignedUrl: (storageKey) =>
      input.storage.createFeedbackAudioSignedUrl(storageKey),
    storageKey: input.storageKey,
  });
}

// Not exported: `createDefaultFeedbackAudioStorage` is the only way in, and a
// second entry point would be one more place the volume layout is restated.
function createFilesystemFeedbackAudioStorage(deps: {
  baseDir: string;
  now?: () => number;
  secret: string;
  uniqueSuffix?: () => string;
}) {
  const now = deps.now ?? Date.now;

  return createFeedbackAudioStorage(
    {
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
    },
    { uniqueSuffix: deps.uniqueSuffix },
  );
}

/**
 * A key per upload rather than per judge: the replacement is written before the
 * one it replaces is removed, so a stable key would have the removal delete the
 * take that had just been saved. The suffix is what keeps the two apart.
 *
 * The extension is passed in rather than looked up again, so only the accepted
 * path can reach here — a `devolucion-x.null` key is unrepresentable.
 */
function buildFeedbackAudioStorageKey(
  input: UploadFeedbackAudioInput,
  suffix: string,
  extension: string,
) {
  return `events/${input.eventId}/presentations/${input.presentationId}/judges/${input.judgeId}/devolucion-${suffix}.${extension}`;
}

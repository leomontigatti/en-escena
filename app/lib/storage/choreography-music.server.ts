import {
  type AssetKind,
  type UploadResult,
  checkAssetAgainstPolicy,
  getAssetExtensionForContentType,
  getAssetKindPolicy,
} from "@/lib/storage/asset-kinds";
import { loadOptionalAssetDownloadUrl } from "@/lib/storage/asset-download-url";
import {
  createFilesystemSignedUrl,
  fsRemove,
  fsUpload,
  getDefaultStorageUrlSigningSecret,
  getDefaultStorageVolumeDir,
} from "@/lib/storage/filesystem-client.server";

const ASSET_KIND: AssetKind = "choreographyMusic";

type UploadChoreographyMusicInput = {
  academyId: string;
  choreographyId: string;
  file: Blob;
};

// The seam ADR-0008 asked for, kept so a future provider is a new
// implementation rather than a rewrite. Signing is not optional: the one live
// store always signs, so there is no "cannot sign" branch to defend (#571).
export type ChoreographyMusicStorageAdapter = {
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

// Live storage is the local Coolify volume in São Paulo. B2 is a backup
// destination reached by the shell scripts, never by the app.
export function createDefaultChoreographyMusicStorage(
  env: NodeJS.ProcessEnv = process.env,
) {
  return createFilesystemChoreographyMusicStorage({
    baseDir: getDefaultStorageVolumeDir(env),
    secret: getDefaultStorageUrlSigningSecret(env),
  });
}

export function createChoreographyMusicStorage(
  adapter: ChoreographyMusicStorageAdapter,
) {
  const policy = getAssetKindPolicy(ASSET_KIND);

  return {
    async createMusicSignedUrl(storageKey: string) {
      return adapter.createSignedUrl({
        bucket: policy.bucket,
        expiresInSeconds: policy.signedUrlExpiresInSeconds,
        key: storageKey,
      });
    },

    async removeMusic(storageKey: string) {
      await adapter.remove({
        bucket: policy.bucket,
        keys: [storageKey],
      });
    },

    async uploadMusic(
      input: UploadChoreographyMusicInput,
    ): Promise<UploadResult> {
      const rejection = checkAssetAgainstPolicy(ASSET_KIND, input.file);

      if (rejection) {
        return { ok: false, rejection };
      }

      const storageKey = buildChoreographyMusicStorageKey(input);

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

export type ChoreographyMusicStorage = ReturnType<
  typeof createChoreographyMusicStorage
>;

/** The one music read path, shared by the portal and the administration. */
export async function loadChoreographyMusicDownloadUrl(input: {
  storage: ChoreographyMusicStorage;
  storageKey: string | null;
}) {
  return loadOptionalAssetDownloadUrl({
    createSignedUrl: (storageKey) =>
      input.storage.createMusicSignedUrl(storageKey),
    storageKey: input.storageKey,
  });
}

export function createFilesystemChoreographyMusicStorage(deps: {
  baseDir: string;
  now?: () => number;
  secret: string;
}) {
  const now = deps.now ?? Date.now;

  return createChoreographyMusicStorage({
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
  });
}

function buildChoreographyMusicStorageKey(input: UploadChoreographyMusicInput) {
  const extension = getAssetExtensionForContentType(
    ASSET_KIND,
    input.file.type,
  );

  return `academies/${input.academyId}/choreographies/${input.choreographyId}/music.${extension}`;
}

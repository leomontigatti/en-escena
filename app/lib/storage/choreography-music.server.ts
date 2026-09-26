import {
  type AssetKind,
  type UploadResult,
  getAssetKindPolicy,
  resolveAssetUpload,
} from "@/lib/storage/asset-kinds";
import { loadOptionalAssetDownloadUrl } from "@/lib/storage/asset-download-url";
import {
  getDefaultStorageUrlSigningSecret,
  getDefaultStorageVolumeDir,
  createFilesystemObjectStorageAdapter,
  type SignedObjectStorageAdapter,
} from "@/lib/storage/filesystem-client.server";

const ASSET_KIND: AssetKind = "choreographyMusic";

type UploadChoreographyMusicInput = {
  academyId: string;
  choreographyId: string;
  file: Blob;
};

export type ChoreographyMusicStorageAdapter = SignedObjectStorageAdapter;

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
      const resolution = resolveAssetUpload(ASSET_KIND, input.file);

      if (!resolution.ok) {
        return { ok: false, rejection: resolution.rejection };
      }

      const storageKey = buildChoreographyMusicStorageKey(
        input,
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
  return createChoreographyMusicStorage(
    createFilesystemObjectStorageAdapter(deps),
  );
}

// The extension is passed in rather than looked up again: only the accepted
// path reaches here, and taking it as an argument makes that unrepresentable
// otherwise instead of a `music.null` key nobody would notice.
function buildChoreographyMusicStorageKey(
  input: UploadChoreographyMusicInput,
  extension: string,
) {
  return `academies/${input.academyId}/choreographies/${input.choreographyId}/music.${extension}`;
}

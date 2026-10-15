import {
  type AssetKind,
  type UploadResult,
  getAssetKindPolicy,
  resolveAssetUpload,
} from "@/lib/storage/asset-kinds";
import { loadOptionalAssetDownloadUrl } from "@/lib/storage/asset-download-url";
import {
  createFilesystemObjectStorageAdapter,
  getDefaultStorageUrlSigningSecret,
  getDefaultStorageVolumeDir,
  type SignedObjectStorageAdapter,
} from "@/lib/storage/filesystem-client.server";

const ASSET_KIND: AssetKind = "individualDocumentPhoto";

// Live storage is the local Coolify volume in São Paulo. B2 is a backup
// destination reached by the shell scripts, never by the app.
export function createDefaultIndividualDocumentPhotoStorage(
  env: NodeJS.ProcessEnv = process.env,
) {
  return createFilesystemIndividualDocumentPhotoStorage({
    baseDir: getDefaultStorageVolumeDir(env),
    secret: getDefaultStorageUrlSigningSecret(env),
  });
}

export function createIndividualDocumentPhotoStorage(
  adapter: SignedObjectStorageAdapter,
) {
  const policy = getAssetKindPolicy(ASSET_KIND);

  return {
    async createDocumentPhotoSignedUrl(storageKey: string) {
      return adapter.createSignedUrl({
        bucket: policy.bucket,
        expiresInSeconds: policy.signedUrlExpiresInSeconds,
        key: storageKey,
      });
    },

    /** Tolerates an object that is already gone, so a retry converges. */
    async removeDocumentPhoto(storageKey: string) {
      await adapter.remove({ bucket: policy.bucket, keys: [storageKey] });
    },

    /**
     * Each upload is a new key and nothing is deleted here: the previous photo
     * is found by the key on the `individual` row and goes only once the row
     * points at this one, so a failed save never leaves the row pointing at a
     * deleted file, and a replacement is never written over the photo in use.
     */
    async uploadDocumentPhoto(input: {
      file: Blob;
      individualId: string;
    }): Promise<UploadResult> {
      const resolution = resolveAssetUpload(ASSET_KIND, input.file);

      if (!resolution.ok) {
        return { ok: false, rejection: resolution.rejection };
      }

      const storageKey = `individuals/${input.individualId}/document-${crypto.randomUUID()}.${resolution.extension}`;

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

export type IndividualDocumentPhotoStorage = ReturnType<
  typeof createIndividualDocumentPhotoStorage
>;

/**
 * The one document-photo read path. No photo and a photo whose object cannot
 * be reached both read as `null`, so a broken object cannot blank the page.
 */
export async function loadIndividualDocumentPhotoUrl(input: {
  documentPhotoStorageKey: string | null;
  storage: IndividualDocumentPhotoStorage;
}) {
  return loadOptionalAssetDownloadUrl({
    createSignedUrl: (storageKey) =>
      input.storage.createDocumentPhotoSignedUrl(storageKey),
    storageKey: input.documentPhotoStorageKey,
  });
}

export function createFilesystemIndividualDocumentPhotoStorage(deps: {
  baseDir: string;
  now?: () => number;
  secret: string;
}) {
  return createIndividualDocumentPhotoStorage(
    createFilesystemObjectStorageAdapter(deps),
  );
}

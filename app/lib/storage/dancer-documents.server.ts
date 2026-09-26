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

const ASSET_KIND: AssetKind = "dancerDocumentImage";

export type DancerDocumentSide = "back" | "front";

type UploadDocumentImageInput = {
  academyId: string;
  dancerId: string;
  file: Blob;
  side: DancerDocumentSide;
};

export type DancerDocumentStorageAdapter = SignedObjectStorageAdapter;

// Live storage is the local Coolify volume in São Paulo. B2 is a backup
// destination reached by the shell scripts, never by the app.
export function createDefaultDancerDocumentStorage(
  env: NodeJS.ProcessEnv = process.env,
) {
  return createFilesystemDancerDocumentStorage({
    baseDir: getDefaultStorageVolumeDir(env),
    secret: getDefaultStorageUrlSigningSecret(env),
  });
}

export function createDancerDocumentStorage(
  adapter: DancerDocumentStorageAdapter,
) {
  const policy = getAssetKindPolicy(ASSET_KIND);

  return {
    async createDocumentImageSignedUrl(storageKey: string) {
      return adapter.createSignedUrl({
        bucket: policy.bucket,
        expiresInSeconds: policy.signedUrlExpiresInSeconds,
        key: storageKey,
      });
    },

    async removeDocumentImages(storageKeys: string[]) {
      await adapter.remove({ bucket: policy.bucket, keys: storageKeys });
    },

    async uploadDocumentImage(
      input: UploadDocumentImageInput,
    ): Promise<UploadResult> {
      const resolution = resolveAssetUpload(ASSET_KIND, input.file);

      if (!resolution.ok) {
        return { ok: false, rejection: resolution.rejection };
      }

      const storageKey = buildDocumentImageStorageKey(
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

      // Nothing is deleted here. The previous file is found by the key on the
      // dancer's row, not by this folder — a merge can leave it elsewhere — and
      // it goes only once the row points at the new one
      // (`removeUnreferencedDocumentImages`), so a refused save never leaves
      // the dancer pointing at a deleted file.
      return { ok: true, storageKey };
    },
  };
}

/**
 * Deletes document images no row points at any more — a photo the academy
 * replaced or removed, or a document a merge discarded. It runs after the row
 * is written, so a failure here cannot undo the save: reporting it as failed
 * would be false. The cost is images left on the volume, and this line is the
 * only thing that makes them locatable without walking the volume by hand —
 * the same trade the choreography music replacement makes.
 */
export async function removeUnreferencedDocumentImages(input: {
  dancerId: string;
  storage?: DancerDocumentStorage;
  storageKeys: string[];
}) {
  if (input.storageKeys.length === 0) {
    return;
  }

  try {
    await (
      input.storage ?? createDefaultDancerDocumentStorage()
    ).removeDocumentImages(input.storageKeys);
  } catch (thrown) {
    console.error("[storage:dancer-document:orphan]", {
      dancerId: input.dancerId,
      detail: thrown instanceof Error ? thrown.message : String(thrown),
      storageKeys: input.storageKeys,
    });
  }
}

export type DancerDocumentStorage = ReturnType<
  typeof createDancerDocumentStorage
>;

export type DancerDocumentImageUrls = {
  back: string | null;
  front: string | null;
};

/**
 * The one document-image read path, shared by the portal and the
 * administration so the two surfaces cannot disagree about whether an image is
 * present.
 */
export async function loadDancerDocumentImageUrls(input: {
  documentBackImageStorageKey: string | null;
  documentFrontImageStorageKey: string | null;
  storage: DancerDocumentStorage;
}): Promise<DancerDocumentImageUrls> {
  const createSignedUrl = (storageKey: string) =>
    input.storage.createDocumentImageSignedUrl(storageKey);

  const [back, front] = await Promise.all([
    loadOptionalAssetDownloadUrl({
      createSignedUrl,
      storageKey: input.documentBackImageStorageKey,
    }),
    loadOptionalAssetDownloadUrl({
      createSignedUrl,
      storageKey: input.documentFrontImageStorageKey,
    }),
  ]);

  return { back, front };
}

export function createFilesystemDancerDocumentStorage(deps: {
  baseDir: string;
  now?: () => number;
  secret: string;
}) {
  return createDancerDocumentStorage(
    createFilesystemObjectStorageAdapter(deps),
  );
}

// The extension is passed in rather than looked up again: only the accepted
// path reaches here, and taking it as an argument makes that unrepresentable
// otherwise instead of a `document-front.null` key nobody would notice.
function buildDocumentImageStorageKey(
  input: UploadDocumentImageInput,
  extension: string,
) {
  const sideSegment = getDocumentImageSideSegment(input.side);

  return `${buildDancerDocumentImagesFolder(input)}/${sideSegment}.${extension}`;
}

function buildDancerDocumentImagesFolder(input: {
  academyId: string;
  dancerId: string;
}) {
  return `academies/${input.academyId}/dancers/${input.dancerId}`;
}

function getDocumentImageSideSegment(side: DancerDocumentSide) {
  const sideSegmentBySide = {
    back: "document-back",
    front: "document-front",
  } as const;

  return sideSegmentBySide[side];
}

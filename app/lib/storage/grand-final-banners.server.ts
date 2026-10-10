import { imageSize } from "image-size";

import {
  checkBannerShape,
  type BannerRejection,
  type GrandFinalBannerSlot,
} from "@/lib/grand-final/banner-shape";
import {
  type AssetKind,
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

const ASSET_KIND: AssetKind = "grandFinalBanner";

type BannerUploadResult =
  { ok: false; rejection: BannerRejection } | { ok: true; storageKey: string };

/**
 * The `Gran final` banners on the uploads volume. Each upload is a new object
 * with its own key, never written over the one in use: the caller points the
 * row at it and only then removes the key it replaced, so a refused second
 * picture or a failed write leaves the banners exactly as they were.
 */
export function createGrandFinalBannerStorage(
  adapter: SignedObjectStorageAdapter,
) {
  const policy = getAssetKindPolicy(ASSET_KIND);

  return {
    async createBannerSignedUrl(storageKey: string) {
      return adapter.createSignedUrl({
        bucket: policy.bucket,
        expiresInSeconds: policy.signedUrlExpiresInSeconds,
        key: storageKey,
      });
    },

    /** Tolerates objects already gone, so a retry converges. */
    async removeBanners(storageKeys: string[]) {
      if (storageKeys.length > 0) {
        await adapter.remove({ bucket: policy.bucket, keys: storageKeys });
      }
    },

    async uploadBanner(input: {
      academyId: string;
      eventId: string;
      file: Blob;
      slot: GrandFinalBannerSlot;
    }): Promise<BannerUploadResult> {
      const resolution = resolveAssetUpload(ASSET_KIND, input.file);

      if (!resolution.ok) {
        return { ok: false, rejection: resolution.rejection };
      }

      const size = readImageSize(
        new Uint8Array(await input.file.arrayBuffer()),
        resolution.extension,
      );

      if (!size) {
        return { ok: false, rejection: { reason: "unreadable-image" } };
      }

      const shapeRejection = checkBannerShape(size);

      if (shapeRejection) {
        return { ok: false, rejection: shapeRejection };
      }

      const storageKey = `events/${input.eventId}/grand-final/${input.academyId}/${input.slot}-${crypto.randomUUID()}.${resolution.extension}`;

      await adapter.upload({
        bucket: policy.bucket,
        file: input.file,
        key: storageKey,
        options: { contentType: input.file.type, upsert: false },
      });

      return { ok: true, storageKey };
    },
  };
}

export type GrandFinalBannerStorage = ReturnType<
  typeof createGrandFinalBannerStorage
>;

// Live storage is the local Coolify volume. B2 is a backup destination reached
// by the shell scripts, never by the app.
export function createDefaultGrandFinalBannerStorage(
  env: NodeJS.ProcessEnv = process.env,
) {
  return createFilesystemGrandFinalBannerStorage({
    baseDir: getDefaultStorageVolumeDir(env),
    secret: getDefaultStorageUrlSigningSecret(env),
  });
}

export function createFilesystemGrandFinalBannerStorage(deps: {
  baseDir: string;
  now?: () => number;
  secret: string;
}) {
  return createGrandFinalBannerStorage(
    createFilesystemObjectStorageAdapter(deps),
  );
}

/** A missing key and an unreachable object both read as "no banner". */
export async function loadGrandFinalBannerUrl(input: {
  storage: GrandFinalBannerStorage;
  storageKey: string | null;
}) {
  return loadOptionalAssetDownloadUrl({
    createSignedUrl: (storageKey) =>
      input.storage.createBannerSignedUrl(storageKey),
    storageKey: input.storageKey,
  });
}

const extensionByDecodedType: Record<string, string> = {
  jpg: "jpg",
  png: "png",
  webp: "webp",
};

/**
 * The size the picture is shown at, read from its own header, or null when the
 * bytes are not the format the upload claimed. EXIF orientations 5 to 8 turn
 * the picture a quarter, which the browser honours, so they swap the sides.
 */
function readImageSize(bytes: Uint8Array, extension: string) {
  let decoded: ReturnType<typeof imageSize>;

  try {
    decoded = imageSize(bytes);
  } catch {
    // A header the decoder cannot read is the user's file, not a fault of the
    // server: it becomes the refusal, never an exception.
    return null;
  }

  if (
    !decoded.width ||
    !decoded.height ||
    extensionByDecodedType[decoded.type ?? ""] !== extension
  ) {
    return null;
  }

  return (decoded.orientation ?? 1) >= 5
    ? { height: decoded.width, width: decoded.height }
    : { height: decoded.height, width: decoded.width };
}

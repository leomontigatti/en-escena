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
  fsList,
  fsRemove,
  fsUpload,
  getDefaultStorageUrlSigningSecret,
  getDefaultStorageVolumeDir,
} from "@/lib/storage/filesystem-client.server";

const ASSET_KIND: AssetKind = "dancerDocumentImage";

export type DancerDocumentSide = "back" | "front";

type UploadDocumentImageInput = {
  academyId: string;
  dancerId: string;
  file: Blob;
  side: DancerDocumentSide;
};

// The seam ADR-0008 asked for, kept so a future provider is a new
// implementation rather than a rewrite. Signing is not optional: the one live
// store always signs, so there is no "cannot sign" branch to defend (#571).
export type DancerDocumentStorageAdapter = {
  createSignedUrl(input: {
    bucket: string;
    expiresInSeconds: number;
    key: string;
  }): Promise<string>;
  list(input: {
    bucket: string;
    prefix: string;
  }): Promise<Array<{ name: string }>>;
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

    async uploadDocumentImage(
      input: UploadDocumentImageInput,
    ): Promise<UploadResult> {
      const rejection = checkAssetAgainstPolicy(ASSET_KIND, input.file);

      if (rejection) {
        return { ok: false, rejection };
      }

      const storageKey = buildDocumentImageStorageKey(input);
      const keysToRemove = await listExistingDocumentImageSideKeys({
        adapter,
        input,
        storageKey,
      });

      await adapter.upload({
        bucket: policy.bucket,
        file: input.file,
        key: storageKey,
        options: {
          contentType: input.file.type,
          upsert: true,
        },
      });

      // Propagated on purpose, unlike choreography music: the row is written
      // only after this returns, so aborting leaves the dancer pointing at the
      // document it already had and the caller can say the save failed. A
      // failed delete still orphans something — here it is the object just
      // uploaded, not the one still in use. Choreography music cannot make that
      // trade: its row already points at the new object by this point.
      if (keysToRemove.length > 0) {
        await adapter.remove({
          bucket: policy.bucket,
          keys: keysToRemove,
        });
      }

      return { ok: true, storageKey };
    },
  };
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
  const now = deps.now ?? Date.now;

  return createDancerDocumentStorage({
    createSignedUrl: async (input) =>
      createFilesystemSignedUrl({
        bucket: input.bucket,
        expiresInSeconds: input.expiresInSeconds,
        key: input.key,
        now: now(),
        secret: deps.secret,
      }),
    list: (input) =>
      fsList({
        baseDir: deps.baseDir,
        bucket: input.bucket,
        prefix: input.prefix,
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

async function listExistingDocumentImageSideKeys(input: {
  adapter: DancerDocumentStorageAdapter;
  input: UploadDocumentImageInput;
  storageKey: string;
}) {
  const folder = buildDancerDocumentImagesFolder(input.input);
  const sideSegment = getDocumentImageSideSegment(input.input.side);
  const files = await input.adapter.list({
    bucket: getAssetKindPolicy(ASSET_KIND).bucket,
    prefix: folder,
  });

  return files
    .filter((file) => file.name.startsWith(`${sideSegment}.`))
    .map((file) => `${folder}/${file.name}`)
    .filter((key) => key !== input.storageKey);
}

function buildDocumentImageStorageKey(input: UploadDocumentImageInput) {
  const extension = getAssetExtensionForContentType(
    ASSET_KIND,
    input.file.type,
  );
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

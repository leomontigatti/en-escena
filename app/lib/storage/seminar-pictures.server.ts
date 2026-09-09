import {
  type AssetKind,
  type UploadResult,
  getAssetKindPolicy,
  resolveAssetUpload,
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

const ASSET_KIND: AssetKind = "seminarInstructorPicture";

type UploadInstructorPictureInput = {
  eventId: string;
  file: Blob;
  seminarId: string;
};

// The seam ADR-0008 asked for, kept so a future provider is a new
// implementation rather than a rewrite. Identical in shape to the dancer
// documents adapter: one object per subject, replaced by extension, so the
// listing is what finds the sibling a new format leaves behind.
export type SeminarPictureStorageAdapter = {
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
export function createDefaultSeminarPictureStorage(
  env: NodeJS.ProcessEnv = process.env,
) {
  return createFilesystemSeminarPictureStorage({
    baseDir: getDefaultStorageVolumeDir(env),
    secret: getDefaultStorageUrlSigningSecret(env),
  });
}

export function createSeminarPictureStorage(
  adapter: SeminarPictureStorageAdapter,
) {
  const policy = getAssetKindPolicy(ASSET_KIND);

  return {
    async createInstructorPictureSignedUrl(storageKey: string) {
      return adapter.createSignedUrl({
        bucket: policy.bucket,
        expiresInSeconds: policy.signedUrlExpiresInSeconds,
        key: storageKey,
      });
    },

    /** Tolerates an object that is already gone, so a retry converges. */
    async removeInstructorPicture(storageKey: string) {
      await adapter.remove({ bucket: policy.bucket, keys: [storageKey] });
    },

    async uploadInstructorPicture(
      input: UploadInstructorPictureInput,
    ): Promise<UploadResult> {
      const resolution = resolveAssetUpload(ASSET_KIND, input.file);

      if (!resolution.ok) {
        return { ok: false, rejection: resolution.rejection };
      }

      const storageKey = buildInstructorPictureStorageKey(
        input,
        resolution.extension,
      );
      const keysToRemove = await listSiblingInstructorPictureKeys({
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

      // Propagated on purpose, as for dancer documents: the row is written only
      // after this returns, so aborting leaves the seminar pointing at the
      // picture it already had and the caller can say the save failed. A failed
      // delete orphans the object just uploaded, not the one still in use.
      if (keysToRemove.length > 0) {
        await adapter.remove({ bucket: policy.bucket, keys: keysToRemove });
      }

      return { ok: true, storageKey };
    },
  };
}

export type SeminarPictureStorage = ReturnType<
  typeof createSeminarPictureStorage
>;

/**
 * The one instructor-picture read path. A seminar without a picture and one
 * whose object cannot be reached both read as "no picture", so a broken object
 * cannot blank the detail or the portal gallery.
 */
export async function loadSeminarInstructorPictureUrl(input: {
  instructorPictureStorageKey: string | null;
  storage: SeminarPictureStorage;
}) {
  return loadOptionalAssetDownloadUrl({
    createSignedUrl: (storageKey) =>
      input.storage.createInstructorPictureSignedUrl(storageKey),
    storageKey: input.instructorPictureStorageKey,
  });
}

export function createFilesystemSeminarPictureStorage(deps: {
  baseDir: string;
  now?: () => number;
  secret: string;
}) {
  const now = deps.now ?? Date.now;

  return createSeminarPictureStorage({
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

/**
 * One object per seminar, so anything under the prefix that is not the key
 * about to be written is the previous picture in another format.
 */
async function listSiblingInstructorPictureKeys(input: {
  adapter: SeminarPictureStorageAdapter;
  input: UploadInstructorPictureInput;
  storageKey: string;
}) {
  const folder = buildSeminarPictureFolder(input.input);
  const files = await input.adapter.list({
    bucket: getAssetKindPolicy(ASSET_KIND).bucket,
    prefix: folder,
  });

  return files
    .map((file) => `${folder}/${file.name}`)
    .filter((key) => key !== input.storageKey);
}

// The extension is passed in rather than looked up again: only the accepted
// path reaches here, and taking it as an argument makes an `instructor.null`
// key unrepresentable instead of unnoticed.
function buildInstructorPictureStorageKey(
  input: UploadInstructorPictureInput,
  extension: string,
) {
  return `${buildSeminarPictureFolder(input)}/instructor.${extension}`;
}

function buildSeminarPictureFolder(input: {
  eventId: string;
  seminarId: string;
}) {
  return `events/${input.eventId}/seminars/${input.seminarId}`;
}

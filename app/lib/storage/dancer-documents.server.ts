import { createClient } from "@supabase/supabase-js";

const DANCER_DOCUMENTS_BUCKET = "dancer-documents";
const DOCUMENT_IMAGE_SIGNED_URL_EXPIRES_IN_SECONDS = 300;
const DOCUMENT_IMAGE_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const DOCUMENT_IMAGE_EXTENSION_BY_CONTENT_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type DancerDocumentSide = "front" | "back";

export type UploadDocumentImageInput = {
  academyId: string;
  dancerId: string;
  file: Blob;
  side: DancerDocumentSide;
};

export type DancerDocumentStorageAdapter = {
  createSignedUrl?(input: {
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

type SupabaseStorageClient = {
  storage: {
    from(bucket: string): {
      createSignedUrl(
        key: string,
        expiresInSeconds: number,
      ): Promise<{
        data: { signedUrl: string } | null;
        error: { message: string } | null;
      }>;
      upload(
        key: string,
        file: Blob,
        options: { contentType: string; upsert: boolean },
      ): Promise<{
        error: { message: string } | null;
      }>;
      list(
        prefix: string,
        options: { limit: number },
      ): Promise<{
        data: Array<{ name: string }> | null;
        error: { message: string } | null;
      }>;
      remove(keys: string[]): Promise<{
        error: { message: string } | null;
      }>;
    };
  };
};

export function createDefaultDancerDocumentStorage() {
  return createSupabaseDancerDocumentStorage(
    createClient(
      getRequiredSupabaseStorageEnv("SUPABASE_URL", process.env),
      getRequiredSupabaseStorageEnv("SUPABASE_SERVICE_ROLE_KEY", process.env),
      {
        auth: {
          persistSession: false,
        },
      },
    ),
  );
}

export function createDancerDocumentStorage(
  adapter: DancerDocumentStorageAdapter,
) {
  return {
    async createDocumentImageSignedUrl(storageKey: string) {
      if (!adapter.createSignedUrl) {
        throw new Error("Storage adapter cannot create signed URLs.");
      }

      return adapter.createSignedUrl({
        bucket: DANCER_DOCUMENTS_BUCKET,
        expiresInSeconds: DOCUMENT_IMAGE_SIGNED_URL_EXPIRES_IN_SECONDS,
        key: storageKey,
      });
    },

    async uploadDocumentImage(input: UploadDocumentImageInput) {
      validateDocumentImage(input.file);

      const storageKey = buildDocumentImageStorageKey(input);
      const keysToRemove = await listExistingDocumentImageSideKeys({
        adapter,
        input,
        storageKey,
      });

      await adapter.upload({
        bucket: DANCER_DOCUMENTS_BUCKET,
        file: input.file,
        key: storageKey,
        options: {
          contentType: input.file.type,
          upsert: true,
        },
      });

      if (keysToRemove.length > 0) {
        await adapter.remove({
          bucket: DANCER_DOCUMENTS_BUCKET,
          keys: keysToRemove,
        });
      }

      return storageKey;
    },
  };
}

export function createSupabaseDancerDocumentStorage(
  supabase: SupabaseStorageClient,
) {
  return createDancerDocumentStorage({
    createSignedUrl: async (input) => {
      const { data, error } = await supabase.storage
        .from(input.bucket)
        .createSignedUrl(input.key, input.expiresInSeconds);

      if (error) {
        throw new Error(
          `Could not create document image URL: ${error.message}`,
        );
      }

      if (!data) {
        throw new Error("Could not create document image URL.");
      }

      return data.signedUrl;
    },
    list: async (input) => {
      const { data, error } = await supabase.storage
        .from(input.bucket)
        .list(input.prefix, { limit: 100 });

      if (error) {
        throw new Error(`Could not list document images: ${error.message}`);
      }

      return data ?? [];
    },
    remove: async (input) => {
      const { error } = await supabase.storage
        .from(input.bucket)
        .remove(input.keys);

      if (error) {
        throw new Error(`Could not remove document images: ${error.message}`);
      }
    },
    upload: async (input) => {
      const { error } = await supabase.storage
        .from(input.bucket)
        .upload(input.key, input.file, input.options);

      if (error) {
        throw new Error(`Could not upload document image: ${error.message}`);
      }
    },
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
    bucket: DANCER_DOCUMENTS_BUCKET,
    prefix: folder,
  });

  return files
    .filter((file) => file.name.startsWith(`${sideSegment}.`))
    .map((file) => `${folder}/${file.name}`)
    .filter((key) => key !== input.storageKey);
}

function buildDocumentImageStorageKey(input: UploadDocumentImageInput) {
  const extension = getDocumentImageExtension(input.file);
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

function validateDocumentImage(file: Blob) {
  if (!isDocumentImageContentType(file.type)) {
    throw new Error("Document image must be a JPEG, PNG, or WebP file.");
  }

  if (file.size > DOCUMENT_IMAGE_MAX_FILE_SIZE_BYTES) {
    throw new Error("Document image must be 10 MB or smaller.");
  }
}

function getDocumentImageExtension(file: Blob) {
  const contentType = file.type;

  if (!isDocumentImageContentType(contentType)) {
    throw new Error("Document image must be a JPEG, PNG, or WebP file.");
  }

  return DOCUMENT_IMAGE_EXTENSION_BY_CONTENT_TYPE[contentType];
}

function isDocumentImageContentType(
  contentType: string,
): contentType is keyof typeof DOCUMENT_IMAGE_EXTENSION_BY_CONTENT_TYPE {
  return contentType in DOCUMENT_IMAGE_EXTENSION_BY_CONTENT_TYPE;
}

export function getRequiredSupabaseStorageEnv(
  name: "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_URL",
  env: NodeJS.ProcessEnv,
) {
  const value = env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

import { createClient } from "@supabase/supabase-js";

import { getRequiredSupabaseStorageEnv } from "@/lib/storage/dancer-documents.server";

const CHOREOGRAPHY_MUSIC_BUCKET = "choreography-music";
const CHOREOGRAPHY_MUSIC_SIGNED_URL_EXPIRES_IN_SECONDS = 300;
const CHOREOGRAPHY_MUSIC_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const CHOREOGRAPHY_MUSIC_EXTENSION_BY_CONTENT_TYPE = {
  "audio/aac": "aac",
  "audio/m4a": "m4a",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
  "audio/x-wav": "wav",
} as const;

type UploadChoreographyMusicInput = {
  academyId: string;
  choreographyId: string;
  file: Blob;
};

export type ChoreographyMusicStorageAdapter = {
  createSignedUrl?(input: {
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
      remove(keys: string[]): Promise<{
        error: { message: string } | null;
      }>;
      upload(
        key: string,
        file: Blob,
        options: { contentType: string; upsert: boolean },
      ): Promise<{
        error: { message: string } | null;
      }>;
    };
  };
};

export function createDefaultChoreographyMusicStorage() {
  return createSupabaseChoreographyMusicStorage(
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

export function createChoreographyMusicStorage(
  adapter: ChoreographyMusicStorageAdapter,
) {
  return {
    async createMusicSignedUrl(storageKey: string) {
      if (!adapter.createSignedUrl) {
        throw new Error("Storage adapter cannot create signed URLs.");
      }

      return adapter.createSignedUrl({
        bucket: CHOREOGRAPHY_MUSIC_BUCKET,
        expiresInSeconds: CHOREOGRAPHY_MUSIC_SIGNED_URL_EXPIRES_IN_SECONDS,
        key: storageKey,
      });
    },

    async removeMusic(storageKey: string) {
      await adapter.remove({
        bucket: CHOREOGRAPHY_MUSIC_BUCKET,
        keys: [storageKey],
      });
    },

    async uploadMusic(input: UploadChoreographyMusicInput) {
      validateChoreographyMusic(input.file);

      const storageKey = buildChoreographyMusicStorageKey(input);

      await adapter.upload({
        bucket: CHOREOGRAPHY_MUSIC_BUCKET,
        file: input.file,
        key: storageKey,
        options: {
          contentType: input.file.type,
          upsert: true,
        },
      });

      return storageKey;
    },
  };
}

export function createSupabaseChoreographyMusicStorage(
  supabase: SupabaseStorageClient,
) {
  return createChoreographyMusicStorage({
    createSignedUrl: async (input) => {
      const { data, error } = await supabase.storage
        .from(input.bucket)
        .createSignedUrl(input.key, input.expiresInSeconds);

      if (error) {
        throw new Error(`Could not create music URL: ${error.message}`);
      }

      if (!data) {
        throw new Error("Could not create music URL.");
      }

      return data.signedUrl;
    },
    remove: async (input) => {
      const { error } = await supabase.storage
        .from(input.bucket)
        .remove(input.keys);

      if (error) {
        throw new Error(`Could not remove music: ${error.message}`);
      }
    },
    upload: async (input) => {
      const { error } = await supabase.storage
        .from(input.bucket)
        .upload(input.key, input.file, input.options);

      if (error) {
        throw new Error(`Could not upload music: ${error.message}`);
      }
    },
  });
}

function buildChoreographyMusicStorageKey(input: UploadChoreographyMusicInput) {
  const extension = getChoreographyMusicExtension(input.file);

  return `academies/${input.academyId}/choreographies/${input.choreographyId}/music.${extension}`;
}

function validateChoreographyMusic(file: Blob) {
  if (!isChoreographyMusicContentType(file.type)) {
    throw new Error(
      "Choreography music must be an MP3, M4A, WAV, or OGG file.",
    );
  }

  if (file.size > CHOREOGRAPHY_MUSIC_MAX_FILE_SIZE_BYTES) {
    throw new Error("Choreography music must be 50 MB or smaller.");
  }
}

function getChoreographyMusicExtension(file: Blob) {
  const contentType = file.type;

  if (!isChoreographyMusicContentType(contentType)) {
    throw new Error(
      "Choreography music must be an MP3, M4A, WAV, or OGG file.",
    );
  }

  return CHOREOGRAPHY_MUSIC_EXTENSION_BY_CONTENT_TYPE[contentType];
}

function isChoreographyMusicContentType(
  contentType: string,
): contentType is keyof typeof CHOREOGRAPHY_MUSIC_EXTENSION_BY_CONTENT_TYPE {
  return contentType in CHOREOGRAPHY_MUSIC_EXTENSION_BY_CONTENT_TYPE;
}

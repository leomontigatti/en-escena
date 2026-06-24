import { describe, expect, test } from "vitest";

import {
  createDancerDocumentStorage,
  createSupabaseDancerDocumentStorage,
  getRequiredSupabaseStorageEnv,
} from "./dancer-documents.server";

describe("dancer document storage", () => {
  test("uploads a dancer document image to the canonical academy-owned key", async () => {
    const uploads: Array<{
      bucket: string;
      file: Blob;
      key: string;
      options: { contentType: string; upsert: boolean };
    }> = [];

    const storage = createDancerDocumentStorage({
      upload: async (input) => {
        uploads.push(input);
      },
    });

    const file = new Blob(["front"], { type: "image/jpeg" });

    const storageKey = await storage.uploadDocumentImage({
      academyId: "academy-1",
      dancerId: "dancer-1",
      file,
      side: "front",
    });

    expect(storageKey).toBe(
      "academies/academy-1/dancers/dancer-1/document-front.jpg",
    );
    expect(uploads).toEqual([
      {
        bucket: "dancer-documents",
        file,
        key: "academies/academy-1/dancers/dancer-1/document-front.jpg",
        options: {
          contentType: "image/jpeg",
          upsert: true,
        },
      },
    ]);
  });

  test("uses the back document key and file extension for other allowed image types", async () => {
    const uploads: Array<{
      bucket: string;
      file: Blob;
      key: string;
      options: { contentType: string; upsert: boolean };
    }> = [];

    const storage = createDancerDocumentStorage({
      upload: async (input) => {
        uploads.push(input);
      },
    });

    const file = new Blob(["back"], { type: "image/webp" });

    const storageKey = await storage.uploadDocumentImage({
      academyId: "academy-2",
      dancerId: "dancer-2",
      file,
      side: "back",
    });

    expect(storageKey).toBe(
      "academies/academy-2/dancers/dancer-2/document-back.webp",
    );
    expect(uploads).toEqual([
      {
        bucket: "dancer-documents",
        file,
        key: "academies/academy-2/dancers/dancer-2/document-back.webp",
        options: {
          contentType: "image/webp",
          upsert: true,
        },
      },
    ]);
  });

  test("rejects unsupported document image types before uploading", async () => {
    const uploads: Array<unknown> = [];
    const storage = createDancerDocumentStorage({
      upload: async (input) => {
        uploads.push(input);
      },
    });

    await expect(
      storage.uploadDocumentImage({
        academyId: "academy-1",
        dancerId: "dancer-1",
        file: new Blob(["pdf"], { type: "application/pdf" }),
        side: "front",
      }),
    ).rejects.toThrow("Document image must be a JPEG, PNG, or WebP file.");

    expect(uploads).toEqual([]);
  });

  test("rejects document image files larger than 10 MB before uploading", async () => {
    const uploads: Array<unknown> = [];
    const storage = createDancerDocumentStorage({
      upload: async (input) => {
        uploads.push(input);
      },
    });

    await expect(
      storage.uploadDocumentImage({
        academyId: "academy-1",
        dancerId: "dancer-1",
        file: new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], {
          type: "image/png",
        }),
        side: "front",
      }),
    ).rejects.toThrow("Document image must be 10 MB or smaller.");

    expect(uploads).toEqual([]);
  });

  test("creates a signed URL for a stored dancer document image", async () => {
    const signedUrlRequests: Array<{
      bucket: string;
      expiresInSeconds: number;
      key: string;
    }> = [];
    const storage = createDancerDocumentStorage({
      createSignedUrl: async (input) => {
        signedUrlRequests.push(input);

        return "https://example.supabase.co/signed/document-front";
      },
      upload: async () => {},
    });

    const signedUrl = await storage.createDocumentImageSignedUrl(
      "academies/academy-1/dancers/dancer-1/document-front.jpg",
    );

    expect(signedUrl).toBe("https://example.supabase.co/signed/document-front");
    expect(signedUrlRequests).toEqual([
      {
        bucket: "dancer-documents",
        expiresInSeconds: 300,
        key: "academies/academy-1/dancers/dancer-1/document-front.jpg",
      },
    ]);
  });

  test("uses Supabase Storage for document uploads and signed URLs", async () => {
    const uploadedFile = new Blob(["front"], { type: "image/png" });
    const calls: Array<unknown> = [];

    const storage = createSupabaseDancerDocumentStorage({
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (key: string, expiresInSeconds: number) => {
            calls.push({ bucket, expiresInSeconds, key, type: "signed-url" });

            return {
              data: { signedUrl: "https://example.supabase.co/signed/front" },
              error: null,
            };
          },
          upload: async (
            key: string,
            file: Blob,
            options: { contentType: string; upsert: boolean },
          ) => {
            calls.push({ bucket, file, key, options, type: "upload" });

            return { data: { path: key }, error: null };
          },
        }),
      },
    });

    await expect(
      storage.uploadDocumentImage({
        academyId: "academy-1",
        dancerId: "dancer-1",
        file: uploadedFile,
        side: "front",
      }),
    ).resolves.toBe("academies/academy-1/dancers/dancer-1/document-front.png");
    await expect(
      storage.createDocumentImageSignedUrl(
        "academies/academy-1/dancers/dancer-1/document-front.png",
      ),
    ).resolves.toBe("https://example.supabase.co/signed/front");

    expect(calls).toEqual([
      {
        bucket: "dancer-documents",
        file: uploadedFile,
        key: "academies/academy-1/dancers/dancer-1/document-front.png",
        options: {
          contentType: "image/png",
          upsert: true,
        },
        type: "upload",
      },
      {
        bucket: "dancer-documents",
        expiresInSeconds: 300,
        key: "academies/academy-1/dancers/dancer-1/document-front.png",
        type: "signed-url",
      },
    ]);
  });

  test("requires Supabase project settings for the default storage client", () => {
    expect(() =>
      getRequiredSupabaseStorageEnv("SUPABASE_SERVICE_ROLE_KEY", {}),
    ).toThrow("SUPABASE_SERVICE_ROLE_KEY is required.");
    expect(
      getRequiredSupabaseStorageEnv("SUPABASE_SERVICE_ROLE_KEY", {
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      }),
    ).toBe("service-role-key");
  });
});

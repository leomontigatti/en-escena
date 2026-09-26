import { describe, expect, test } from "vitest";

import type { DancerDocumentStorage } from "@/lib/storage/dancer-documents.server";

import { resolvePortalDancerDocumentImageStorageKeys } from "./server";

function createStorage(
  overrides: Partial<DancerDocumentStorage> = {},
): DancerDocumentStorage {
  return {
    createDocumentImageSignedUrl: async (storageKey: string) =>
      `signed:${storageKey}`,
    removeDocumentImages: async () => {
      throw new Error("removeDocumentImages was not expected to be called");
    },
    uploadDocumentImage: async () => {
      throw new Error("uploadDocumentImage was not expected to be called");
    },
    ...overrides,
  };
}

const stored = {
  back: "dancers/back-existing.jpg",
  front: "dancers/front-existing.jpg",
};

describe("portal dancer detail server", () => {
  test("keeps the stored keys, not the submitted ones, and never touches the store when no file is uploaded", async () => {
    const formData = new FormData();
    formData.set("documentFrontImageStorageKey", "academies/other/front.jpg");
    formData.set("documentBackImageStorageKey", "academies/other/back.jpg");

    await expect(
      resolvePortalDancerDocumentImageStorageKeys({
        academyId: "academy_1",
        dancerId: "dancer_1",
        formData,
        storage: createStorage(),
        stored,
      }),
    ).resolves.toEqual({
      ok: true,
      keys: {
        back: "dancers/back-existing.jpg",
        front: "dancers/front-existing.jpg",
      },
      unreferencedKeys: [],
    });
  });

  test("leaves a removed side empty and names its stored key", async () => {
    const formData = new FormData();
    formData.set("documentFrontImageStorageKey", "dancers/front-existing.jpg");
    formData.set("documentBackImageStorageKey", "");

    await expect(
      resolvePortalDancerDocumentImageStorageKeys({
        academyId: "academy_1",
        dancerId: "dancer_1",
        formData,
        storage: createStorage(),
        stored,
      }),
    ).resolves.toEqual({
      ok: true,
      keys: { back: "", front: "dancers/front-existing.jpg" },
      unreferencedKeys: ["dancers/back-existing.jpg"],
    });
  });

  test("uploads a new document image, keeps the untouched side and names the replaced key", async () => {
    const uploads: Array<{ side: string }> = [];
    const storage = createStorage({
      uploadDocumentImage: async (input) => {
        uploads.push({ side: input.side });

        return {
          ok: true,
          storageKey: `academies/${input.academyId}/dancers/${input.dancerId}/document-${input.side}.png`,
        };
      },
    });

    const formData = new FormData();
    formData.set("documentFrontImageStorageKey", "dancers/front-existing.jpg");
    formData.set("documentBackImageStorageKey", "dancers/back-existing.jpg");
    formData.set(
      "documentFrontImage",
      new File(["front"], "front.png", { type: "image/png" }),
    );

    await expect(
      resolvePortalDancerDocumentImageStorageKeys({
        academyId: "academy_1",
        dancerId: "dancer_1",
        formData,
        storage,
        stored,
      }),
    ).resolves.toEqual({
      ok: true,
      keys: {
        back: "dancers/back-existing.jpg",
        front: "academies/academy_1/dancers/dancer_1/document-front.png",
      },
      unreferencedKeys: ["dancers/front-existing.jpg"],
    });
    expect(uploads).toEqual([{ side: "front" }]);
  });

  // The Spanish sentence is produced from the rejection value, so rewording
  // anything in the storage layer cannot silently degrade this copy (#571).
  test("names the offending side when the store rejects the file", async () => {
    const storage = createStorage({
      uploadDocumentImage: async () => ({
        ok: false,
        rejection: {
          contentType: "text/plain",
          kind: "dancerDocumentImage",
          reason: "unsupported-content-type",
        },
      }),
    });

    const formData = new FormData();
    formData.set("documentFrontImageStorageKey", "dancers/front-existing.jpg");
    formData.set("documentBackImageStorageKey", "dancers/back-existing.jpg");
    formData.set(
      "documentBackImage",
      new File(["back"], "back.txt", { type: "text/plain" }),
    );

    await expect(
      resolvePortalDancerDocumentImageStorageKeys({
        academyId: "academy_1",
        dancerId: "dancer_1",
        formData,
        storage,
        stored,
      }),
    ).resolves.toEqual({
      ok: false,
      message: "El archivo del dorso debe ser JPG, PNG o WEBP.",
    });
  });

  test("falls back to a generic message when the volume itself fails", async () => {
    const storage = createStorage({
      uploadDocumentImage: async () => {
        throw new Error("volume unavailable");
      },
    });

    const formData = new FormData();
    formData.set("documentFrontImageStorageKey", "");
    formData.set("documentBackImageStorageKey", "");
    formData.set(
      "documentFrontImage",
      new File(["front"], "front.png", { type: "image/png" }),
    );

    await expect(
      resolvePortalDancerDocumentImageStorageKeys({
        academyId: "academy_1",
        dancerId: "dancer_1",
        formData,
        storage,
        stored,
      }),
    ).resolves.toEqual({
      ok: false,
      message: "No pudimos subir el archivo del frente. Intentá nuevamente.",
    });
  });
});

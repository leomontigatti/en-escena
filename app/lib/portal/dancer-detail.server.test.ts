import { describe, expect, test } from "vitest";

import {
  loadPortalDancerDocumentImageUrls,
  resolvePortalDancerDocumentImageStorageKeys,
} from "./dancer-detail.server";

describe("portal dancer detail server", () => {
  test("uploads new document images, keeps existing keys, and translates upload failures", async () => {
    const uploads: Array<{
      academyId: string;
      dancerId: string;
      file: File;
      side: "back" | "front";
    }> = [];
    const storage = {
      createDocumentImageSignedUrl: async (storageKey: string) =>
        `signed:${storageKey}`,
      uploadDocumentImage: async (input: {
        academyId: string;
        dancerId: string;
        file: File;
        side: "back" | "front";
      }) => {
        uploads.push(input);

        if (input.side === "back") {
          throw new Error("Document image must be a JPEG, PNG, or WebP file.");
        }

        return `academies/${input.academyId}/dancers/${input.dancerId}/document-${input.side}.png`;
      },
    };

    const imageUrls = await loadPortalDancerDocumentImageUrls(
      {
        documentBackImageStorageKey: "dancers/back.jpg",
        documentFrontImageStorageKey: "dancers/front.jpg",
      },
      storage,
    );

    expect(imageUrls).toEqual({
      back: "signed:dancers/back.jpg",
      front: "signed:dancers/front.jpg",
    });

    const formData = new FormData();
    formData.set("documentFrontImageStorageKey", "dancers/front-existing.jpg");
    formData.set("documentBackImageStorageKey", "dancers/back-existing.jpg");
    formData.set(
      "documentFrontImage",
      new File(["front"], "front.png", { type: "image/png" }),
    );

    await expect(
      resolvePortalDancerDocumentImageStorageKeys(
        {
          academyId: "academy_1",
          dancerId: "dancer_1",
          formData,
        },
        storage,
      ),
    ).resolves.toEqual({
      ok: true,
      keys: {
        back: "dancers/back-existing.jpg",
        front: "academies/academy_1/dancers/dancer_1/document-front.png",
      },
    });

    expect(uploads).toEqual([
      {
        academyId: "academy_1",
        dancerId: "dancer_1",
        file: formData.get("documentFrontImage"),
        side: "front",
      },
    ]);

    formData.set(
      "documentBackImage",
      new File(["back"], "back.txt", { type: "text/plain" }),
    );

    await expect(
      resolvePortalDancerDocumentImageStorageKeys(
        {
          academyId: "academy_1",
          dancerId: "dancer_1",
          formData,
        },
        storage,
      ),
    ).resolves.toEqual({
      ok: false,
      message: "El archivo del dorso debe ser JPG, PNG o WEBP.",
    });
  });
});

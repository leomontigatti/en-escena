import { describe, expect, test } from "vitest";

import {
  type AssetKind,
  assetKindPolicies,
  checkAssetAgainstPolicy,
  formatUploadRejection,
  getAssetExtensionForContentType,
  getAssetKindAccept,
  getAssetKindHelperText,
  getAssetUploadFieldProps,
  resolveAssetUpload,
} from "@/lib/storage/asset-kinds";

const assetKinds: AssetKind[] = ["choreographyMusic", "dancerDocumentImage"];

describe("asset kind policy", () => {
  // The volume layout and the B2 backup prefix are built from these names, so
  // renaming one is a migration, not a refactor (#571).
  test("pins the bucket of each asset kind", () => {
    expect(assetKindPolicies.choreographyMusic.bucket).toBe(
      "en-escena-choreography-music",
    );
    expect(assetKindPolicies.dancerDocumentImage.bucket).toBe(
      "en-escena-dancer-documents",
    );
  });

  test("derives the accept attribute from the accepted content types", () => {
    expect(getAssetKindAccept("dancerDocumentImage")).toBe(
      "image/jpeg,image/png,image/webp",
    );
    expect(getAssetKindAccept("choreographyMusic").split(",")).toContain(
      "audio/mpeg",
    );
  });

  test("offers the browser exactly what the server accepts", () => {
    for (const kind of assetKinds) {
      const fieldProps = getAssetUploadFieldProps(kind);

      expect(fieldProps.accept.split(",")).toEqual(fieldProps.allowedMimeTypes);

      for (const contentType of fieldProps.allowedMimeTypes) {
        expect(
          checkAssetAgainstPolicy(kind, { size: 1, type: contentType }),
        ).toBeNull();
      }
    }
  });

  test("states the real ceiling in the helper text", () => {
    expect(getAssetKindHelperText("choreographyMusic")).toBe(
      "MP3, M4A, WAV u OGG - max 50 MB",
    );
    expect(getAssetKindHelperText("dancerDocumentImage")).toBe(
      "JPG, PNG o WEBP - max 10 MB",
    );
  });

  test("maps every accepted content type to an extension", () => {
    for (const kind of assetKinds) {
      for (const contentType of Object.keys(
        assetKindPolicies[kind].extensionByContentType,
      )) {
        expect(getAssetExtensionForContentType(kind, contentType)).toBeTruthy();
      }
    }

    expect(
      getAssetExtensionForContentType("dancerDocumentImage", "image/gif"),
    ).toBeNull();
  });
});

describe("resolveAssetUpload", () => {
  // The key builders consume this extension directly, so an accepted file that
  // resolved to no extension would write `music.undefined` to the volume.
  test("hands the key builder an extension for every accepted content type", () => {
    for (const kind of assetKinds) {
      for (const contentType of getAssetUploadFieldProps(kind)
        .allowedMimeTypes) {
        const resolution = resolveAssetUpload(kind, {
          size: 1,
          type: contentType,
        });

        expect(resolution).toEqual({
          extension: getAssetExtensionForContentType(kind, contentType),
          ok: true,
        });
        expect(resolution.ok && resolution.extension).toBeTruthy();
      }
    }
  });

  test("refuses a content type the policy has no extension for", () => {
    expect(
      resolveAssetUpload("choreographyMusic", { size: 1, type: "audio/mp3" }),
    ).toEqual({
      ok: false,
      rejection: {
        contentType: "audio/mp3",
        kind: "choreographyMusic",
        reason: "unsupported-content-type",
      },
    });
  });

  test("checks the format before the ceiling, so a huge PDF is named a format problem", () => {
    expect(
      resolveAssetUpload("dancerDocumentImage", {
        size: assetKindPolicies.dancerDocumentImage.maxFileSizeBytes + 1,
        type: "application/pdf",
      }),
    ).toEqual({
      ok: false,
      rejection: {
        contentType: "application/pdf",
        kind: "dancerDocumentImage",
        reason: "unsupported-content-type",
      },
    });
  });
});

describe("checkAssetAgainstPolicy", () => {
  test("rejects an unsupported content type", () => {
    expect(
      checkAssetAgainstPolicy("dancerDocumentImage", {
        size: 1,
        type: "application/pdf",
      }),
    ).toEqual({
      contentType: "application/pdf",
      kind: "dancerDocumentImage",
      reason: "unsupported-content-type",
    });
  });

  test("rejects a file over the ceiling", () => {
    const sizeBytes = assetKindPolicies.choreographyMusic.maxFileSizeBytes + 1;

    expect(
      checkAssetAgainstPolicy("choreographyMusic", {
        size: sizeBytes,
        type: "audio/mpeg",
      }),
    ).toEqual({
      kind: "choreographyMusic",
      reason: "file-too-large",
      sizeBytes,
    });
  });

  test("accepts a file exactly at the ceiling", () => {
    expect(
      checkAssetAgainstPolicy("choreographyMusic", {
        size: assetKindPolicies.choreographyMusic.maxFileSizeBytes,
        type: "audio/mpeg",
      }),
    ).toBeNull();
  });
});

describe("formatUploadRejection", () => {
  test("names the real limit for an oversized file", () => {
    expect(
      formatUploadRejection({
        kind: "choreographyMusic",
        reason: "file-too-large",
        sizeBytes: 1,
      }),
    ).toBe("El archivo de música no puede superar 50 MB.");
  });

  test("names the accepted formats for a wrong-format file", () => {
    expect(
      formatUploadRejection({
        contentType: "application/pdf",
        kind: "choreographyMusic",
        reason: "unsupported-content-type",
      }),
    ).toBe("El archivo de música debe ser MP3, M4A, WAV u OGG.");
  });

  test("names the specific field when one kind has several", () => {
    expect(
      formatUploadRejection(
        { kind: "dancerDocumentImage", reason: "file-too-large", sizeBytes: 1 },
        { fieldLabel: "frente" },
      ),
    ).toBe("El archivo del frente no puede superar 10 MB.");

    expect(
      formatUploadRejection(
        {
          contentType: "image/gif",
          kind: "dancerDocumentImage",
          reason: "unsupported-content-type",
        },
        { fieldLabel: "dorso" },
      ),
    ).toBe("El archivo del dorso debe ser JPG, PNG o WEBP.");
  });

  // The copy is derived, so raising a ceiling cannot leave a stale number in a
  // sentence the user reads — which is the whole point of the registry.
  test("follows the policy rather than a hardcoded number", () => {
    const megabytes =
      assetKindPolicies.dancerDocumentImage.maxFileSizeBytes / (1024 * 1024);

    expect(
      formatUploadRejection({
        kind: "dancerDocumentImage",
        reason: "file-too-large",
        sizeBytes: 1,
      }),
    ).toContain(`${megabytes} MB`);
  });
});

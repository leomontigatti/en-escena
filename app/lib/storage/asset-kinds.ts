// One declaration per uploaded asset kind. Every surface that needs to know
// what is accepted — the server validation, the browser `accept` attribute, the
// Spanish copy a user reads — derives it from here instead of restating it, so
// raising a ceiling or adding a format is one edit and cannot leave the
// surfaces disagreeing (#571).
//
// This module is deliberately client-safe: it has no imports and reads no
// environment, so the forms can import the same declaration the server enforces.

export type AssetKind =
  | "choreographyMusic"
  | "dancerDocumentImage"
  | "eventDocument";

export type AssetKindPolicy = {
  /**
   * Directory under the storage volume, and the prefix under the B2 backup.
   * Pinned by tests: renaming one invalidates the volume and the backup.
   */
  bucket: string;
  extensionByContentType: Readonly<Record<string, string>>;
  /** Human-readable format list for user copy, e.g. `MP3, M4A, WAV u OGG`. */
  formatListLabel: string;
  maxFileSizeBytes: number;
  signedUrlExpiresInSeconds: number;
  /** Sentence subject for user copy when no field label applies. */
  subjectLabel: string;
};

const BYTES_PER_MEGABYTE = 1024 * 1024;

export const assetKindPolicies = {
  choreographyMusic: {
    bucket: "en-escena-choreography-music",
    extensionByContentType: {
      "audio/aac": "aac",
      "audio/m4a": "m4a",
      "audio/mp4": "m4a",
      "audio/mpeg": "mp3",
      "audio/ogg": "ogg",
      "audio/wav": "wav",
      "audio/x-m4a": "m4a",
      "audio/x-wav": "wav",
    },
    formatListLabel: "MP3, M4A, WAV u OGG",
    maxFileSizeBytes: 50 * BYTES_PER_MEGABYTE,
    signedUrlExpiresInSeconds: 300,
    subjectLabel: "El archivo de música",
  },
  dancerDocumentImage: {
    bucket: "en-escena-dancer-documents",
    extensionByContentType: {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    },
    formatListLabel: "JPG, PNG o WEBP",
    maxFileSizeBytes: 10 * BYTES_PER_MEGABYTE,
    signedUrlExpiresInSeconds: 300,
    subjectLabel: "El archivo",
  },
  // One kind for the three event documents: they share a single policy, so
  // there is nothing to differentiate. Which document a message is about comes
  // from the `fieldLabel` option, the way `frente`/`dorso` already do.
  eventDocument: {
    bucket: "en-escena-event-documents",
    extensionByContentType: {
      "application/pdf": "pdf",
    },
    formatListLabel: "PDF",
    maxFileSizeBytes: 10 * BYTES_PER_MEGABYTE,
    signedUrlExpiresInSeconds: 300,
    subjectLabel: "El documento",
  },
} as const satisfies Record<AssetKind, AssetKindPolicy>;

/**
 * A policy violation the user can correct by choosing a different file. Faults
 * the user cannot act on (an unwritable volume, a full disk) stay exceptions:
 * flattening them into form feedback would tell an academy to compress a file
 * when the real problem is the server.
 */
export type UploadRejection =
  | { contentType: string; kind: AssetKind; reason: "unsupported-content-type" }
  | { kind: AssetKind; reason: "file-too-large"; sizeBytes: number };

export type UploadResult =
  | { ok: false; rejection: UploadRejection }
  | { ok: true; storageKey: string };

export function getAssetKindPolicy(kind: AssetKind): AssetKindPolicy {
  return assetKindPolicies[kind];
}

export function getAssetKindAllowedContentTypes(kind: AssetKind) {
  return Object.keys(assetKindPolicies[kind].extensionByContentType);
}

/** The `accept` attribute for a file input, derived so it cannot drift. */
export function getAssetKindAccept(kind: AssetKind) {
  return getAssetKindAllowedContentTypes(kind).join(",");
}

export function getAssetKindMaxFileSizeMegabytes(kind: AssetKind) {
  return assetKindPolicies[kind].maxFileSizeBytes / BYTES_PER_MEGABYTE;
}

export function getAssetKindHelperText(kind: AssetKind) {
  const policy = assetKindPolicies[kind];

  return `${policy.formatListLabel} - max ${getAssetKindMaxFileSizeMegabytes(kind)} MB`;
}

export function getAssetExtensionForContentType(
  kind: AssetKind,
  contentType: string,
): string | null {
  const extensionByContentType: Readonly<Record<string, string>> =
    assetKindPolicies[kind].extensionByContentType;

  return extensionByContentType[contentType] ?? null;
}

/**
 * An accepted file together with the extension its key must carry, or the
 * reason it was refused. Resolving both in one step is what keeps a key from
 * ever being built for a content type the policy has no extension for.
 */
export type AssetUploadResolution =
  | { extension: string; ok: true }
  | { ok: false; rejection: UploadRejection };

/**
 * The one gate every upload passes through. Returns the rejection rather than
 * throwing, so the surface renders Spanish from a value instead of matching the
 * English text of an exception.
 */
export function resolveAssetUpload(
  kind: AssetKind,
  file: { size: number; type: string },
): AssetUploadResolution {
  const extension = getAssetExtensionForContentType(kind, file.type);

  // An absent extension *is* the unsupported-type case: the accepted set is
  // exactly the key set of `extensionByContentType`.
  if (!extension) {
    return {
      ok: false,
      rejection: {
        contentType: file.type,
        kind,
        reason: "unsupported-content-type",
      },
    };
  }

  if (file.size > assetKindPolicies[kind].maxFileSizeBytes) {
    return {
      ok: false,
      rejection: { kind, reason: "file-too-large", sizeBytes: file.size },
    };
  }

  return { extension, ok: true };
}

/** `resolveAssetUpload` for callers that only need the verdict. */
export function checkAssetAgainstPolicy(
  kind: AssetKind,
  file: { size: number; type: string },
): UploadRejection | null {
  const resolution = resolveAssetUpload(kind, file);

  return resolution.ok ? null : resolution.rejection;
}

/**
 * How a `fieldLabel` is named in a sentence. The gender is carried because the
 * contraction depends on it: "el archivo **del** contrato" but "el archivo
 * **de la** autorización". Masculine is the default, which is what every caller
 * that predates the third asset kind needs.
 */
export type UploadSubjectOptions = {
  fieldLabel?: string;
  gender?: "feminine" | "masculine";
};

/**
 * The single place a rejection becomes Spanish. `fieldLabel` names the specific
 * input when one asset kind has several ("frente", "dorso"); without it the
 * kind's own subject is used.
 */
export function formatUploadRejection(
  rejection: UploadRejection,
  options: UploadSubjectOptions = {},
) {
  switch (rejection.reason) {
    case "file-too-large":
      return getAssetKindMaxFileSizeMessage(rejection.kind, options);
    case "unsupported-content-type":
      return getAssetKindInvalidTypeMessage(rejection.kind, options);
  }
}

export function getAssetKindInvalidTypeMessage(
  kind: AssetKind,
  options: UploadSubjectOptions = {},
) {
  return `${getSubject(kind, options)} debe ser ${assetKindPolicies[kind].formatListLabel}.`;
}

export function getAssetKindMaxFileSizeMessage(
  kind: AssetKind,
  options: UploadSubjectOptions = {},
) {
  return `${getSubject(kind, options)} no puede superar ${getAssetKindMaxFileSizeMegabytes(kind)} MB.`;
}

/**
 * The props a file input needs to enforce the same policy the server does.
 * Spread at the call site so no surface restates a format list or a ceiling.
 */
export function getAssetUploadFieldProps(
  kind: AssetKind,
  options: UploadSubjectOptions = {},
) {
  return {
    accept: getAssetKindAccept(kind),
    allowedMimeTypes: getAssetKindAllowedContentTypes(kind),
    helperText: getAssetKindHelperText(kind),
    invalidTypeMessage: getAssetKindInvalidTypeMessage(kind, options),
    maxFileSizeBytes: assetKindPolicies[kind].maxFileSizeBytes,
    maxFileSizeMessage: getAssetKindMaxFileSizeMessage(kind, options),
  };
}

function getSubject(kind: AssetKind, options: UploadSubjectOptions) {
  if (!options.fieldLabel) {
    return assetKindPolicies[kind].subjectLabel;
  }

  const contraction = options.gender === "feminine" ? "de la" : "del";

  return `El archivo ${contraction} ${options.fieldLabel}`;
}

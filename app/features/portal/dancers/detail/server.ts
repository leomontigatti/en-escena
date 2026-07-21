import { createDefaultDancerDocumentStorage } from "@/lib/storage/dancer-documents.server";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { routeNotificationToasts } from "@/lib/shared/route-notification-toasts";
import {
  archiveDancerForAcademy,
  findDancerForAcademy,
  reactivateDancerForAcademy,
  updateDancerForAcademy,
} from "@/lib/portal/dancers.server";

import {
  getClientDocumentImageValidationMessage,
  portalDancerNotFoundMessage,
  readPortalDancerFormValues,
  readPortalDancerId,
  readFormString,
  type PortalDancerDocumentImageUrls,
} from "./shared";

type PortalDancerDocumentStorage = ReturnType<
  typeof createDefaultDancerDocumentStorage
>;

export async function loadPortalDancerDetail(input: {
  request: Request;
  params: { dancerId?: string };
}) {
  const { academy } = await requireAcademyUser(input.request);
  const dancerId = readPortalDancerId(input.params);
  const dancer = await requirePortalDancer(academy.id, dancerId);

  return {
    dancer,
    documentImageUrls: await loadPortalDancerDocumentImageUrls(dancer),
  };
}

export async function handlePortalDancerDetailAction(input: {
  request: Request;
  params: { dancerId?: string };
}) {
  const { academy } = await requireAcademyUser(input.request);
  const dancerId = readPortalDancerId(input.params);
  const formData = await input.request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === "archive-dancer") {
    await archiveDancerForAcademy(academy.id, dancerId);
    return {
      status: "success" as const,
      message: routeNotificationToasts["bailarin-archivado"].message,
    };
  }

  if (intent === "reactivate-dancer") {
    await reactivateDancerForAcademy(academy.id, dancerId);
    return {
      status: "success" as const,
      message: routeNotificationToasts["bailarin-reactivado"].message,
    };
  }

  if (intent !== "" && intent !== "update-dancer") {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const submittedValues = readPortalDancerFormValues(formData);
  const clientImageValidationMessage =
    getClientDocumentImageValidationMessage(formData);

  if (clientImageValidationMessage) {
    return {
      status: "error" as const,
      message: clientImageValidationMessage,
      fieldErrors: {},
      values: submittedValues,
    };
  }

  const documentImageStorageKeys =
    await resolvePortalDancerDocumentImageStorageKeys({
      academyId: academy.id,
      dancerId,
      formData,
    });

  if (!documentImageStorageKeys.ok) {
    return {
      status: "error" as const,
      message: documentImageStorageKeys.message,
      fieldErrors: {},
      values: submittedValues,
    };
  }

  const result = await updateDancerForAcademy(academy.id, dancerId, {
    ...submittedValues,
    documentFrontImageStorageKey: documentImageStorageKeys.keys.front,
    documentBackImageStorageKey: documentImageStorageKeys.keys.back,
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.error,
      fieldErrors: result.fieldErrors,
      values: result.values,
    };
  }

  return {
    status: "success" as const,
    message: routeNotificationToasts["bailarin-guardado"].message,
  };
}

async function requirePortalDancer(academyId: string, dancerId: string) {
  const dancer = await findDancerForAcademy(academyId, dancerId);

  if (!dancer) {
    throw new Response(portalDancerNotFoundMessage, { status: 404 });
  }

  return dancer;
}

export async function loadPortalDancerDocumentImageUrls(
  dancer: {
    documentBackImageStorageKey: string | null;
    documentFrontImageStorageKey: string | null;
  },
  storage?: PortalDancerDocumentStorage,
): Promise<PortalDancerDocumentImageUrls> {
  if (
    !dancer.documentFrontImageStorageKey &&
    !dancer.documentBackImageStorageKey
  ) {
    return {
      back: null,
      front: null,
    };
  }

  try {
    const storageClient = storage ?? createDefaultDancerDocumentStorage();

    return {
      back: await createOptionalDocumentImageSignedUrl(
        storageClient,
        dancer.documentBackImageStorageKey,
      ),
      front: await createOptionalDocumentImageSignedUrl(
        storageClient,
        dancer.documentFrontImageStorageKey,
      ),
    };
  } catch {
    return {
      back: null,
      front: null,
    };
  }
}

export async function resolvePortalDancerDocumentImageStorageKeys(
  input: {
    academyId: string;
    dancerId: string;
    formData: FormData;
  },
  storage?: PortalDancerDocumentStorage,
): Promise<
  | { ok: true; keys: { back: string; front: string } }
  | { ok: false; message: string }
> {
  const frontImage = readOptionalFormFile(input.formData, "documentFrontImage");
  const backImage = readOptionalFormFile(input.formData, "documentBackImage");
  const getStorageClient = createPortalDancerDocumentStorageResolver(storage);
  const frontStorageKey = await uploadOptionalDancerDocumentImage({
    academyId: input.academyId,
    dancerId: input.dancerId,
    fallbackStorageKey: readFormString(
      input.formData,
      "documentFrontImageStorageKey",
    ),
    file: frontImage,
    side: "front",
    getStorage: getStorageClient,
  });

  if (!frontStorageKey.ok) {
    return frontStorageKey;
  }

  const backStorageKey = await uploadOptionalDancerDocumentImage({
    academyId: input.academyId,
    dancerId: input.dancerId,
    fallbackStorageKey: readFormString(
      input.formData,
      "documentBackImageStorageKey",
    ),
    file: backImage,
    side: "back",
    getStorage: getStorageClient,
  });

  if (!backStorageKey.ok) {
    return backStorageKey;
  }

  return {
    ok: true,
    keys: {
      back: backStorageKey.storageKey,
      front: frontStorageKey.storageKey,
    },
  };
}

async function createOptionalDocumentImageSignedUrl(
  storage: PortalDancerDocumentStorage,
  storageKey: string | null,
) {
  if (!storageKey) {
    return null;
  }

  try {
    return await storage.createDocumentImageSignedUrl(storageKey);
  } catch {
    return null;
  }
}

async function uploadOptionalDancerDocumentImage(input: {
  academyId: string;
  dancerId: string;
  fallbackStorageKey: string;
  file: File | null;
  getStorage: () => PortalDancerDocumentStorage;
  side: "back" | "front";
}): Promise<{ ok: true; storageKey: string } | { ok: false; message: string }> {
  if (!input.file) {
    return { ok: true, storageKey: input.fallbackStorageKey };
  }

  try {
    return {
      ok: true,
      storageKey: await input.getStorage().uploadDocumentImage({
        academyId: input.academyId,
        dancerId: input.dancerId,
        file: input.file,
        side: input.side,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      message: getDocumentImageUploadErrorMessage(error, input.side),
    };
  }
}

function createPortalDancerDocumentStorageResolver(
  storage: PortalDancerDocumentStorage | undefined,
) {
  let resolvedStorage = storage;

  return () => {
    resolvedStorage ??= createDefaultDancerDocumentStorage();
    return resolvedStorage;
  };
}

function readOptionalFormFile(formData: FormData, key: string) {
  const value = formData.get(key);

  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  return value;
}

function getDocumentImageUploadErrorMessage(
  error: unknown,
  side: "back" | "front",
) {
  const fieldLabel = side === "front" ? "frente" : "dorso";

  if (
    error instanceof Error &&
    error.message === "Document image must be 10 MB or smaller."
  ) {
    return `El archivo del ${fieldLabel} no puede superar 10 MB.`;
  }

  if (
    error instanceof Error &&
    error.message === "Document image must be a JPEG, PNG, or WebP file."
  ) {
    return `El archivo del ${fieldLabel} debe ser JPG, PNG o WEBP.`;
  }

  return `No pudimos subir el archivo del ${fieldLabel}. Intentá nuevamente.`;
}

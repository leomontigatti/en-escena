import { formatUploadRejection } from "@/lib/storage/asset-kinds";
import {
  type DancerDocumentSide,
  type DancerDocumentStorage,
  createDefaultDancerDocumentStorage,
  loadDancerDocumentImageUrls,
} from "@/lib/storage/dancer-documents.server";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { notificationToasts } from "@/lib/shared/notification-toasts";
import {
  findDancerForAcademy,
  updateDancerForAcademy,
} from "@/lib/portal/dancers.server";
import { setRosterPersonStatus } from "@/lib/roster/roster-person-status.server";

import {
  getClientDocumentImageValidationMessage,
  portalDancerNotFoundMessage,
  readPortalDancerFormValues,
  readPortalDancerId,
  readFormString,
} from "./shared";

export async function loadPortalDancerDetail(input: {
  request: Request;
  params: { dancerId?: string };
}) {
  const { academy } = await requireAcademyUser(input.request);
  const dancerId = readPortalDancerId(input.params);
  const dancer = await requirePortalDancer(academy.id, dancerId);

  return {
    dancer,
    documentImageUrls: await loadDancerDocumentImageUrls({
      documentBackImageStorageKey: dancer.documentBackImageStorageKey,
      documentFrontImageStorageKey: dancer.documentFrontImageStorageKey,
      storage: createDefaultDancerDocumentStorage(),
    }),
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
    await setRosterPersonStatus({
      academyId: academy.id,
      kind: "dancer",
      next: "archived",
      personId: dancerId,
      surface: "portal",
    });
    return {
      status: "success" as const,
      message: notificationToasts["bailarin-archivado"].message,
    };
  }

  if (intent === "reactivate-dancer") {
    await setRosterPersonStatus({
      academyId: academy.id,
      kind: "dancer",
      next: "active",
      personId: dancerId,
      surface: "portal",
    });
    return {
      status: "success" as const,
      message: notificationToasts["bailarin-reactivado"].message,
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
      storage: createDefaultDancerDocumentStorage(),
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
    message: notificationToasts["bailarin-guardado"].message,
  };
}

async function requirePortalDancer(academyId: string, dancerId: string) {
  const dancer = await findDancerForAcademy(academyId, dancerId);

  if (!dancer) {
    throw new Response(portalDancerNotFoundMessage, { status: 404 });
  }

  return dancer;
}

export async function resolvePortalDancerDocumentImageStorageKeys(input: {
  academyId: string;
  dancerId: string;
  formData: FormData;
  storage: DancerDocumentStorage;
}): Promise<
  | { ok: true; keys: { back: string; front: string } }
  | { ok: false; message: string }
> {
  const frontImage = readOptionalFormFile(input.formData, "documentFrontImage");
  const backImage = readOptionalFormFile(input.formData, "documentBackImage");
  const frontStorageKey = await uploadOptionalDancerDocumentImage({
    academyId: input.academyId,
    dancerId: input.dancerId,
    fallbackStorageKey: readFormString(
      input.formData,
      "documentFrontImageStorageKey",
    ),
    file: frontImage,
    side: "front",
    storage: input.storage,
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
    storage: input.storage,
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

async function uploadOptionalDancerDocumentImage(input: {
  academyId: string;
  dancerId: string;
  fallbackStorageKey: string;
  file: File | null;
  side: DancerDocumentSide;
  storage: DancerDocumentStorage;
}): Promise<{ ok: true; storageKey: string } | { ok: false; message: string }> {
  if (!input.file) {
    return { ok: true, storageKey: input.fallbackStorageKey };
  }

  const fieldLabel = input.side === "front" ? "frente" : "dorso";

  try {
    const uploaded = await input.storage.uploadDocumentImage({
      academyId: input.academyId,
      dancerId: input.dancerId,
      file: input.file,
      side: input.side,
    });

    if (!uploaded.ok) {
      return {
        ok: false,
        message: formatUploadRejection(uploaded.rejection, { fieldLabel }),
      };
    }

    return { ok: true, storageKey: uploaded.storageKey };
  } catch {
    // Only infrastructure reaches here now: every policy rejection arrives as a
    // value above, so rewording a message cannot silently degrade this to the
    // generic sentence.
    return {
      ok: false,
      message: `No pudimos subir el archivo del ${fieldLabel}. Intentá nuevamente.`,
    };
  }
}

function readOptionalFormFile(formData: FormData, key: string) {
  const value = formData.get(key);

  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  return value;
}

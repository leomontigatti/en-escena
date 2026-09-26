import type { z } from "zod";

import { readAcknowledgedDuplicateIds } from "@/lib/shared/duplicate-warning";
import { formatUploadRejection } from "@/lib/storage/asset-kinds";
import {
  type DancerDocumentSide,
  type DancerDocumentStorage,
  createDefaultDancerDocumentStorage,
  loadDancerDocumentImageUrls,
  removeUnreferencedDocumentImages,
} from "@/lib/storage/dancer-documents.server";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { findDancerInscriptions } from "@/lib/dancers/inscriptions.server";
import {
  findActiveEventStartDateOnly,
  getEventStartDateOnly,
} from "@/lib/events/active-event.server";
import { getPortalActiveEventContext } from "@/lib/portal/event-context.server";
import {
  findDancerForAcademy,
  updateDancerForAcademy,
  type UpdateDancerField,
} from "@/lib/portal/dancers.server";
import { hasActiveEventParticipation } from "@/lib/roster/active-event-participation.server";
import {
  getRosterPersonNotFoundMessage,
  setRosterPersonStatus,
} from "@/lib/roster/roster-person-status.server";

import {
  buildPortalDancerActionSuccess,
  buildPortalDancerSchema,
  getClientDocumentImageValidationMessage,
  portalDancerInvalidValuesMessage,
  portalDancerNotFoundMessage,
  readPortalDancerFormValues,
  readPortalDancerId,
  readFormString,
  type PortalDancerFormValues,
} from "./shared";

export async function loadPortalDancerDetail(input: {
  request: Request;
  params: { dancerId?: string };
}) {
  const { academy } = await requireAcademyUser(input.request);
  const dancerId = readPortalDancerId(input.params);
  const dancer = await requirePortalDancer(academy.id, dancerId);
  const eventContext = await getPortalActiveEventContext(input.request);
  const selectedEventId = eventContext.selectedEvent?.id ?? null;
  const { inscriptions } = await findDancerInscriptions({
    dancerId,
    selectedEventId,
  });

  return {
    activeEventStartDate: getEventStartDateOnly(eventContext.activeEvent),
    dancer,
    documentImageUrls: await loadDancerDocumentImageUrls({
      documentBackImageStorageKey: dancer.documentBackImageStorageKey,
      documentFrontImageStorageKey: dancer.documentFrontImageStorageKey,
      storage: createDefaultDancerDocumentStorage(),
    }),
    inscriptions,
    isParticipatingInActiveEvent: await hasActiveEventParticipation({
      kind: "dancer",
      personId: dancerId,
    }),
    selectedEventId,
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
    const result = await setRosterPersonStatus({
      academyId: academy.id,
      kind: "dancer",
      next: "archived",
      personId: dancerId,
      surface: "portal",
    });

    if (!result.ok) {
      // Two causes, two channels: a missing id —or a dancer of another
      // academy— is a URL error and keeps its 404, while a refused archive
      // comes back as `actionData` and reaches the academy as a toast.
      if (result.cause === "participating") {
        return {
          status: "error" as const,
          message: result.message,
          fieldErrors: {},
        };
      }

      throw new Response(getRosterPersonNotFoundMessage("dancer"), {
        status: 404,
      });
    }
    return buildPortalDancerActionSuccess("bailarin-archivado", []);
  }

  if (intent === "reactivate-dancer") {
    const result = await setRosterPersonStatus({
      academyId: academy.id,
      kind: "dancer",
      next: "active",
      personId: dancerId,
      surface: "portal",
    });

    if (!result.ok) {
      throw new Response(getRosterPersonNotFoundMessage("dancer"), {
        status: 404,
      });
    }
    return buildPortalDancerActionSuccess("bailarin-reactivado", []);
  }

  if (intent !== "" && intent !== "update-dancer") {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  return await savePortalDancer({
    academyId: academy.id,
    dancerId,
    formData,
  });
}

/**
 * The edit itself, apart from the status intents: what the academy submitted,
 * validated, uploaded and written.
 */
async function savePortalDancer({
  academyId,
  dancerId,
  formData,
}: {
  academyId: string;
  dancerId: string;
  formData: FormData;
}) {
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

  // Parsed before any upload runs: a birth date the schema refuses must not
  // leave a file behind in the store.
  const parsed = buildPortalDancerSchema(
    await findActiveEventStartDateOnly(),
  ).safeParse(submittedValues);

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: portalDancerInvalidValuesMessage,
      fieldErrors: getPortalDancerFieldErrors(parsed.error),
      values: submittedValues,
    };
  }

  const stored = await requirePortalDancer(academyId, dancerId);
  const storage = createDefaultDancerDocumentStorage();
  const documentImageStorageKeys =
    await resolvePortalDancerDocumentImageStorageKeys({
      academyId: academyId,
      dancerId,
      formData,
      storage,
      stored: {
        back: stored.documentBackImageStorageKey,
        front: stored.documentFrontImageStorageKey,
      },
    });

  if (!documentImageStorageKeys.ok) {
    return {
      status: "error" as const,
      message: documentImageStorageKeys.message,
      fieldErrors: {},
      values: submittedValues,
    };
  }

  const result = await updateDancerForAcademy(
    academyId,
    dancerId,
    {
      ...submittedValues,
      documentFrontImageStorageKey: documentImageStorageKeys.keys.front,
      documentBackImageStorageKey: documentImageStorageKeys.keys.back,
    },
    { acknowledgedDuplicateIds: readAcknowledgedDuplicateIds(formData) },
  );

  if (!result.ok && "warning" in result) {
    return {
      status: "warning" as const,
      warning: result.warning,
      values: submittedValues,
    };
  }

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.error,
      fieldErrors: result.fieldErrors,
      values: result.values,
      duplicateDocumentDancerId: result.duplicateDocumentDancerId,
    };
  }

  await removeUnreferencedDocumentImages({
    dancerId,
    storage,
    storageKeys: documentImageStorageKeys.unreferencedKeys,
  });

  return buildPortalDancerActionSuccess(
    "bailarin-guardado",
    result.recategorisedChoreographies,
    result.scheduleMoves,
  );
}

function getPortalDancerFieldErrors(
  error: z.ZodError<PortalDancerFormValues>,
): Partial<Record<UpdateDancerField, string>> {
  const fieldErrors = error.flatten().fieldErrors;

  return Object.fromEntries(
    Object.entries(fieldErrors).flatMap(([field, messages]) =>
      messages?.[0] ? [[field, messages[0]]] : [],
    ),
  );
}

async function requirePortalDancer(academyId: string, dancerId: string) {
  const dancer = await findDancerForAcademy(academyId, dancerId);

  if (!dancer) {
    throw new Response(portalDancerNotFoundMessage, { status: 404 });
  }

  return dancer;
}

/**
 * The document image keys to write, and the stored ones they leave behind.
 * The key fields of the form only say whether the academy kept the photo or
 * removed it: a kept photo keeps the key already on the row, so a key the
 * browser sends is never written — it could point this dancer at any file on
 * the volume. The stored key is also what finds a replaced file, which a merge
 * can leave outside the dancer's own folder.
 */
export async function resolvePortalDancerDocumentImageStorageKeys(input: {
  academyId: string;
  dancerId: string;
  formData: FormData;
  storage: DancerDocumentStorage;
  stored: { back: string | null; front: string | null };
}): Promise<
  | {
      ok: true;
      keys: { back: string; front: string };
      unreferencedKeys: string[];
    }
  | { ok: false; message: string }
> {
  const front = await resolveDocumentImageSide({ ...input, side: "front" });

  if (!front.ok) {
    return front;
  }

  const back = await resolveDocumentImageSide({ ...input, side: "back" });

  if (!back.ok) {
    return back;
  }

  return {
    ok: true,
    keys: { back: back.storageKey, front: front.storageKey },
    unreferencedKeys: [back, front]
      .map((side) => side.unreferencedKey)
      .filter((key): key is string => key !== null),
  };
}

async function resolveDocumentImageSide(input: {
  academyId: string;
  dancerId: string;
  formData: FormData;
  side: DancerDocumentSide;
  storage: DancerDocumentStorage;
  stored: { back: string | null; front: string | null };
}): Promise<
  | { ok: true; storageKey: string; unreferencedKey: string | null }
  | { ok: false; message: string }
> {
  const storedKey = input.stored[input.side];
  const file = readOptionalFormFile(
    input.formData,
    input.side === "front" ? "documentFrontImage" : "documentBackImage",
  );

  if (!file) {
    const kept =
      readFormString(
        input.formData,
        input.side === "front"
          ? "documentFrontImageStorageKey"
          : "documentBackImageStorageKey",
      ) !== "";

    return kept
      ? { ok: true, storageKey: storedKey ?? "", unreferencedKey: null }
      : { ok: true, storageKey: "", unreferencedKey: storedKey };
  }

  const uploaded = await uploadDancerDocumentImage({ ...input, file });

  if (!uploaded.ok) {
    return uploaded;
  }

  return {
    ok: true,
    storageKey: uploaded.storageKey,
    unreferencedKey:
      storedKey !== null && storedKey !== uploaded.storageKey
        ? storedKey
        : null,
  };
}

async function uploadDancerDocumentImage(input: {
  academyId: string;
  dancerId: string;
  file: File;
  side: DancerDocumentSide;
  storage: DancerDocumentStorage;
}): Promise<{ ok: true; storageKey: string } | { ok: false; message: string }> {
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

import { getFieldErrors } from "@/lib/shared/form-validation";
import { redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import { dancerNotFoundMessage } from "@/lib/admin/dancers/dancers.shared";
import {
  findDancer,
  setDancerActiveState,
  verifyDancerIdentity,
} from "@/lib/admin/dancers/dancers.server";
import { updateAdministrativeDancer } from "@/lib/admin/dancers/dancers-update.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { createDefaultDancerDocumentStorage } from "@/lib/storage/dancer-documents.server";

import {
  buildBackToListHref,
  buildDancerActionError,
  buildDancerActionSuccess,
  buildDancerUpdateSchema,
  buildModeHref,
  dancerFieldNames,
  readDancerUpdateValues,
} from "./shared";

export async function loadDancerDetail(input: {
  request: Request;
  params: { dancerId?: string };
}) {
  const user = await requireInternalUser(input.request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const dancerId = readDancerId(input.params);
  const dancer = await findDancer({
    dancerId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!dancer) {
    throw new Response(dancerNotFoundMessage, { status: 404 });
  }

  const url = new URL(input.request.url);

  return {
    canEdit: user.role === "admin",
    selectedEventId: eventContext.selectedEventId,
    dancer,
    documentImageUrls: await loadDancerDocumentImageUrls(dancer),
    backToList: buildBackToListHref(input.request.url),
    editHref: buildModeHref(url, dancerId, "editar"),
    cancelHref: buildModeHref(url, dancerId, null),
    isEditing:
      user.role === "admin" && url.searchParams.get("modo") === "editar",
  };
}

export async function handleDancerDetailAction(input: {
  request: Request;
  params: { dancerId?: string };
}) {
  await requireAdminUser(input.request);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const dancerId = readDancerId(input.params);
  const formData = await input.request.formData();
  const intent = formData.get("intent");
  const dancer = await findDancer({
    dancerId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!dancer) {
    throw new Response(dancerNotFoundMessage, { status: 404 });
  }

  if (intent === "archive-dancer" || intent === "reactivate-dancer") {
    await setDancerActiveState({
      action: intent === "archive-dancer" ? "archive" : "reactivate",
      dancerId,
      selectedEventId: eventContext.selectedEventId,
    });

    return buildDancerActionSuccess(
      intent === "archive-dancer"
        ? "bailarin-archivado"
        : "bailarin-reactivado",
    );
  }

  if (intent === "verify-dancer-identity") {
    await verifyDancerIdentity({
      dancerId,
      selectedEventId: eventContext.selectedEventId,
    });

    return buildDancerActionSuccess("bailarin-verificado");
  }

  const submittedValues = readDancerUpdateValues(formData);
  const values = {
    ...submittedValues,
    documentBackImageStorageKey: dancer.documentBackImageStorageKey ?? "",
    documentFrontImageStorageKey: dancer.documentFrontImageStorageKey ?? "",
  };
  const parsed = buildDancerUpdateSchema().safeParse(values);

  if (!parsed.success) {
    return buildDancerActionError(
      "Revisá los campos marcados.",
      getFieldErrors(parsed.error, dancerFieldNames),
      values,
    );
  }

  const result = await updateAdministrativeDancer({
    dancerId,
    selectedEventId: eventContext.selectedEventId,
    values: parsed.data,
  });

  if (!result.ok) {
    return buildDancerActionError(
      result.message,
      result.fieldErrors,
      result.values,
    );
  }

  return buildDancerActionSuccess(
    result.verificationInvalidated
      ? "bailarin-guardado-requiere-verificacion"
      : "bailarin-guardado",
  );
}

async function loadDancerDocumentImageUrls(
  dancer: NonNullable<Awaited<ReturnType<typeof findDancer>>>,
) {
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
    const storage = createDefaultDancerDocumentStorage();

    return {
      back: await createOptionalDocumentImageSignedUrl(
        storage,
        dancer.documentBackImageStorageKey,
      ),
      front: await createOptionalDocumentImageSignedUrl(
        storage,
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

async function createOptionalDocumentImageSignedUrl(
  storage: ReturnType<typeof createDefaultDancerDocumentStorage>,
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

function readDancerId(params: { dancerId?: string }) {
  if (!params.dancerId) {
    throw new Response(dancerNotFoundMessage, { status: 404 });
  }

  return params.dancerId;
}

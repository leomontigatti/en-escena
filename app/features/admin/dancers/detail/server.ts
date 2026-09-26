import { getFieldErrors } from "@/lib/shared/form-validation";
import { readAcknowledgedDuplicateIds } from "@/lib/shared/duplicate-warning";
import { redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import { dancerNotFoundMessage } from "@/lib/admin/dancers/dancers.shared";
import {
  findDancer,
  verifyDancerIdentity,
} from "@/lib/admin/dancers/dancers.server";
import {
  getRosterPersonNotFoundMessage,
  setRosterPersonStatus,
} from "@/lib/roster/roster-person-status.server";
import { updateAdministrativeDancer } from "@/lib/admin/dancers/dancers-update.server";
import { hasActiveEventParticipation } from "@/lib/roster/active-event-participation.server";
import {
  loadRosterMergeOptions,
  submitRosterMerge,
} from "@/lib/roster/roster-merge.server";
import { rosterMergeIntents } from "@/lib/roster/roster-merge.shared";
import { findActiveEventStartDateOnly } from "@/lib/events/active-event.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import {
  createDefaultDancerDocumentStorage,
  loadDancerDocumentImageUrls,
} from "@/lib/storage/dancer-documents.server";

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
    activeEventStartDate: await findActiveEventStartDateOnly(),
    canEdit: user.role === "admin",
    selectedEventId: eventContext.selectedEventId,
    dancer,
    documentImageUrls: await loadDancerDocumentImageUrls({
      documentBackImageStorageKey: dancer.documentBackImageStorageKey,
      documentFrontImageStorageKey: dancer.documentFrontImageStorageKey,
      storage: createDefaultDancerDocumentStorage(),
    }),
    backToList: buildBackToListHref(input.request.url),
    editHref: buildModeHref(url, dancerId, "editar"),
    cancelHref: buildModeHref(url, dancerId, null),
    isEditing:
      user.role === "admin" && url.searchParams.get("modo") === "editar",
    isParticipatingInActiveEvent: await hasActiveEventParticipation({
      kind: "dancer",
      personId: dancerId,
    }),
    merge:
      user.role === "admin"
        ? await loadRosterMergeOptions({ kind: "dancer", personId: dancerId })
        : null,
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
    const result = await setRosterPersonStatus({
      academyId: null,
      kind: "dancer",
      next: intent === "archive-dancer" ? "archived" : "active",
      personId: dancerId,
      surface: "admin",
    });

    if (!result.ok) {
      // Two causes, two channels: a missing id is a URL error and keeps its
      // 404, while a refused archive is the academy's own doing and comes back
      // as `actionData` — a toast, and the dialog re-opened.
      if (result.cause === "participating") {
        return buildDancerActionError(result.message, {});
      }

      throw new Response(getRosterPersonNotFoundMessage("dancer"), {
        status: 404,
      });
    }

    return buildDancerActionSuccess(
      intent === "archive-dancer"
        ? "bailarin-archivado"
        : "bailarin-reactivado",
      [],
    );
  }

  if (intent === rosterMergeIntents.dancer) {
    return await submitRosterMerge({
      formData,
      kind: "dancer",
      personId: dancerId,
    });
  }

  if (intent === "verify-dancer-identity") {
    await verifyDancerIdentity({
      dancerId,
      selectedEventId: eventContext.selectedEventId,
    });

    return buildDancerActionSuccess("bailarin-verificado", []);
  }

  return await saveAdministrativeDancer({
    dancer,
    dancerId,
    formData,
    selectedEventId: eventContext.selectedEventId,
  });
}

/**
 * The edit itself, apart from the status and verification intents.
 */
async function saveAdministrativeDancer({
  dancer,
  dancerId,
  formData,
  selectedEventId,
}: {
  dancer: NonNullable<Awaited<ReturnType<typeof findDancer>>>;
  dancerId: string;
  formData: FormData;
  selectedEventId: string | null;
}) {
  const submittedValues = readDancerUpdateValues(formData);
  const values = {
    ...submittedValues,
    documentBackImageStorageKey: dancer.documentBackImageStorageKey ?? "",
    documentFrontImageStorageKey: dancer.documentFrontImageStorageKey ?? "",
  };
  const parsed = buildDancerUpdateSchema(
    await findActiveEventStartDateOnly(),
  ).safeParse(values);

  if (!parsed.success) {
    return buildDancerActionError(
      "Revisá los campos marcados.",
      getFieldErrors(parsed.error, dancerFieldNames),
      values,
    );
  }

  const result = await updateAdministrativeDancer({
    acknowledgedDuplicateIds: readAcknowledgedDuplicateIds(formData),
    dancerId,
    selectedEventId: selectedEventId,
    values: parsed.data,
  });

  if (!result.ok && "warning" in result) {
    return {
      status: "warning" as const,
      warning: result.warning,
      values: parsed.data,
    };
  }

  if (!result.ok) {
    return buildDancerActionError(
      result.message,
      result.fieldErrors,
      result.values,
      result.duplicateDocumentDancerId,
    );
  }

  return buildDancerActionSuccess(
    result.verificationInvalidated
      ? "bailarin-guardado-requiere-verificacion"
      : "bailarin-guardado",
    result.recategorisedChoreographies,
    result.scheduleMoves,
  );
}

function readDancerId(params: { dancerId?: string }) {
  if (!params.dancerId) {
    throw new Response(dancerNotFoundMessage, { status: 404 });
  }

  return params.dancerId;
}

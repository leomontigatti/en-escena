import {
  handleChoreographyDetailAction,
  loadChoreographyDetailRouteData,
  type ChoreographyDetailActionData,
  type ChoreographyDetailLoaderData,
} from "@/features/admin/choreographies/detail/server";
import { toSavedChoreographyDraft } from "@/features/admin/choreographies/detail/draft-form";
import {
  resolveChoreographyDraftIntent,
  saveChoreographyDraftIntent,
  toChoreographyDraftFormData,
  type ChoreographyDraft,
  type ChoreographyDraftPreview,
} from "@/features/admin/choreographies/detail/draft.shared";
import { deleteChoreographyIntent } from "@/features/admin/choreographies/detail/shared";
import { createSignedInRequest } from "@/lib/test-support/auth";

type Role = "academy" | "admin" | "auditor" | "judge";

// Every signed request creates its own user, so each one needs a distinct
// email unless the test names one.
let requestCount = 0;

function nextEmail(role: Role) {
  return `${role}.coreografias.${(requestCount += 1)}@example.com`;
}

function detailUrl(choreographyId: string) {
  return `http://localhost/administracion/coreografias/${choreographyId}`;
}

export async function loadDetail(input: {
  choreographyId: string;
  email?: string;
  role?: Role;
}) {
  const role = input.role ?? "admin";
  const { request } = await createSignedInRequest({
    email: input.email ?? nextEmail(role),
    requestUrl: detailUrl(input.choreographyId),
    role,
  });

  return await loadChoreographyDetailRouteData({
    params: { choreographyId: input.choreographyId },
    request,
  });
}

export async function submitDetailAction(input: {
  body: FormData;
  choreographyId: string;
  email?: string;
  role?: Role;
}) {
  const role = input.role ?? "admin";
  const { request } = await createSignedInRequest({
    body: input.body,
    email: input.email ?? nextEmail(role),
    requestUrl: detailUrl(input.choreographyId),
    role,
  });

  return await handleChoreographyDetailAction({
    params: { choreographyId: input.choreographyId },
    request,
  });
}

async function readSavedDraft(choreographyId: string) {
  const detail = await loadDetail({ choreographyId });

  return toSavedChoreographyDraft(detail.choreography);
}

export function readDraftPreview(
  response: ChoreographyDetailActionData | Response,
): ChoreographyDraftPreview {
  if (
    response instanceof Response ||
    !("intent" in response) ||
    response.intent !== resolveChoreographyDraftIntent
  ) {
    throw new Error("the action did not answer the draft preview");
  }

  return response.preview;
}

/**
 * What the form does with an edit: the saved choreography as the draft plus the
 * edits, previewed and then saved with the category the preview showed.
 */
export async function saveDraftEdits(input: {
  choreographyId: string;
  edits: Partial<ChoreographyDraft>;
}) {
  const draft = {
    ...(await readSavedDraft(input.choreographyId)),
    ...input.edits,
  };
  const preview = readDraftPreview(
    await submitDetailAction({
      body: toChoreographyDraftFormData({
        draft,
        intent: resolveChoreographyDraftIntent,
      }),
      choreographyId: input.choreographyId,
    }),
  );

  return await submitDetailAction({
    body: toChoreographyDraftFormData({
      draft,
      intent: saveChoreographyDraftIntent,
      previewedCategoryId: preview.category?.id ?? null,
    }),
    choreographyId: input.choreographyId,
  });
}

export async function submitDraftAsAuditor(input: {
  choreographyId: string;
  edits: Partial<ChoreographyDraft>;
}) {
  return await submitDetailAction({
    body: toChoreographyDraftFormData({
      draft: {
        ...(await readSavedDraft(input.choreographyId)),
        ...input.edits,
      },
      intent: saveChoreographyDraftIntent,
    }),
    choreographyId: input.choreographyId,
    role: "auditor",
  });
}

export function deleteFormData() {
  const formData = new FormData();
  formData.set("intent", deleteChoreographyIntent);
  return formData;
}

/**
 * The fields the form keeps editable while the loader says it can: the level
 * needs a category that takes one, the capacity needs a choice to make.
 */
export function canPickExperienceLevel(detail: ChoreographyDetailLoaderData) {
  return (
    detail.canEdit &&
    detail.draft.structuralLock === null &&
    detail.draft.experienceLevel.required
  );
}

export function canPickScheduleCapacity(detail: ChoreographyDetailLoaderData) {
  return (
    detail.canEdit &&
    detail.draft.structuralLock === null &&
    detail.draft.scheduleCapacity.options.length > 1
  );
}

import { redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminPanelReader,
  requireAdminPanelWriter,
} from "@/lib/auth/internal-access.server";
import { canWriteInAdminPanel } from "@/lib/auth/user-role.shared";
import {
  previewChoreographyRemovalOutcome,
  removeChoreography,
} from "@/lib/choreographies/choreography-removal.server";
import { choreographiesPath } from "@/lib/choreographies/admin-paths";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import {
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
} from "@/lib/choreographies/choreography-roster-options.server";
import type {
  ChoreographyDancerOption,
  ChoreographyProfessorOption,
} from "@/lib/choreographies/choreography-roster.shared";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import { readFormData } from "@/lib/shared/read-form-data";

import {
  findChoreographyDetail,
  type ChoreographyDetail,
} from "./choreography-queries.server";
import { toSavedChoreographyDraft } from "./draft-form";
import { resolveChoreographyDraft } from "./draft-resolution.server";
import { saveChoreographyDraft } from "./draft-save.server";
import { toScheduleCapacityBlockers } from "./draft-schedule.server";
import {
  readChoreographyDraftFormData,
  resolveChoreographyDraftIntent,
  saveChoreographyDraftIntent,
  type ChoreographyDraftPreview,
} from "./draft.shared";
import {
  listChoreographyModalityBlockers,
  listChoreographyModalityOptions,
  type ChoreographyModalityOption,
} from "./modality.server";
import {
  deleteChoreographyIntent,
  type ChoreographyDeleteBlocker,
  type ChoreographyFieldUpdateErrorData,
  type ChoreographyModalityBlocker,
  type ChoreographyRemovalPreview,
  type ChoreographyScheduleCapacityBlocker,
  type ChoreographySuccessData,
} from "./shared";

// The detail modules import `ChoreographyDetail` from here: it is the type of
// the record the whole view works with, and its query lives apart.
export type { ChoreographyDetail };

export type ChoreographyDetailLoaderData = {
  availableDancers: ChoreographyDancerOption[];
  availableProfessors: ChoreographyProfessorOption[];
  backToList: string;
  canEdit: boolean;
  choreography: ChoreographyDetail;
  deletion: {
    blockers: ChoreographyDeleteBlocker[];
    canDelete: boolean;
    /** Whether the page offers `Eliminar` at all, open or blocked: it is an
     * administrator's action, and the auditor gets no menu. */
    isOffered: boolean;
    outcome: ChoreographyRemovalPreview;
  };
  /**
   * The preview of the choreography as saved: the options the draft starts
   * from, before any field is touched.
   */
  draft: ChoreographyDraftPreview;
  modality: {
    blockers: ChoreographyModalityBlocker[];
    options: ChoreographyModalityOption[];
  };
  scheduleCapacity: {
    blockers: ChoreographyScheduleCapacityBlocker[];
  };
  selectedEventId: string | null;
};

const unsupportedActionMessage = "Acción no soportada.";

const withdrawnChoreographyIsReadOnlyMessage =
  "Esta coreografía está retirada y no se puede modificar. Para que vuelva a participar, registrá una nueva.";

/**
 * The hidden controls are not the rule: a withdrawn choreography accepts
 * nothing, whoever posts to it, because the withdrawal is final. Its money is
 * handled from the finance surfaces, which write against the inscriptions and
 * not here.
 */
function assertChoreographyAcceptsIntent(input: {
  choreography: ChoreographyDetail;
}) {
  if (!input.choreography.isWithdrawn) {
    return;
  }

  throw new Response(withdrawnChoreographyIsReadOnlyMessage, {
    status: 403,
  });
}

type ChoreographyDetailParams = {
  choreographyId?: string;
};

export async function loadChoreographyDetailRouteData(input: {
  request: Request;
  params: ChoreographyDetailParams;
}): Promise<ChoreographyDetailLoaderData> {
  const user = await requireAdminPanelReader(input.request);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const { choreography, selectedEventId } = await findRoutedChoreography({
    params: input.params,
    selectedEventId: eventContext.selectedEventId,
  });
  const choreographyId = choreography.id;

  // A withdrawn choreography accepts no edit whoever the user is: the
  // withdrawal is final, so every field the view gates on `canEdit` goes
  // read-only while the stamp is there.
  const canEdit = canWriteInAdminPanel(user.role) && !choreography.isWithdrawn;
  const [
    blockers,
    availableDancers,
    availableProfessors,
    savedDraft,
    modalityBlockers,
    modalityOptions,
    removalOutcome,
  ] = await Promise.all([
    getChoreographyDeleteBlockers(choreography),
    listDancerOptionsForChoreography(
      choreography.academyId,
      choreography.dancers.map((dancer) => dancer.id),
    ),
    listProfessorOptionsForChoreography(
      choreography.academyId,
      choreography.professors.map((professor) => professor.id),
    ),
    resolveChoreographyDraft({
      choreography,
      draft: toSavedChoreographyDraft(choreography),
      eventId: selectedEventId,
    }),
    listChoreographyModalityBlockers({
      choreography,
      eventId: selectedEventId,
    }),
    listChoreographyModalityOptions(selectedEventId),
    previewChoreographyRemovalOutcome(choreographyId),
  ]);

  return {
    availableDancers,
    availableProfessors,
    backToList: choreographiesPath,
    canEdit,
    choreography,
    deletion: {
      blockers,
      canDelete: blockers.length === 0,
      isOffered: canWriteInAdminPanel(user.role),
      // What the dialog announces, and only that: the write re-decides under
      // the choreography's row lock, so money landing between the render and
      // the click still leads to a withdrawal.
      outcome: removalOutcome,
    },
    draft: savedDraft.preview,
    modality: {
      // A deposit does not close the field: it is listed as a
      // blocker-in-waiting, because it only refuses the save when the draft
      // would land on a schedule that reprices the money.
      blockers: modalityBlockers,
      options: modalityOptions,
    },
    scheduleCapacity: {
      // What the price filter did to the capacities the saved choreography
      // could move to, read off the ones it left. The reasons go to the view
      // for the auditor too: the page's alert lists them.
      blockers: toScheduleCapacityBlockers({
        hasPriceDivergentOption:
          savedDraft.schedule.priceDivergentIds.length > 0,
        hasSelectableAlternative: savedDraft.schedule.options.some(
          (option) => option.id !== choreography.scheduleCapacityId,
        ),
      }),
    },
    selectedEventId,
  };
}

export type ChoreographyDraftPreviewData = {
  intent: typeof resolveChoreographyDraftIntent;
  preview: ChoreographyDraftPreview;
};

export type ChoreographyDetailActionData =
  | ChoreographyDraftPreviewData
  | ChoreographyFieldUpdateErrorData
  | ChoreographySuccessData;

export async function handleChoreographyDetailAction(input: {
  request: Request;
  params: ChoreographyDetailParams;
}): Promise<ChoreographyDetailActionData | Response> {
  await requireAdminPanelWriter(input.request);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const { choreography, selectedEventId } = await findRoutedChoreography({
    params: input.params,
    selectedEventId: eventContext.selectedEventId,
  });

  const formData = await readFormData(input.request);
  const intent = formData.get("intent");

  assertChoreographyAcceptsIntent({ choreography });

  if (intent === resolveChoreographyDraftIntent) {
    const resolution = await resolveChoreographyDraft({
      choreography,
      draft: readChoreographyDraftFormData(formData).draft,
      eventId: selectedEventId,
    });

    return {
      intent: resolveChoreographyDraftIntent,
      preview: resolution.preview,
    };
  }

  if (intent === saveChoreographyDraftIntent) {
    return await saveChoreographyDraft({
      choreography,
      eventId: selectedEventId,
      formData,
    });
  }

  if (intent === deleteChoreographyIntent) {
    const outcome = await deleteChoreography(choreography);
    return redirectWithFlashNotification(
      choreographiesPath,
      outcome === "withdrawn"
        ? "choreography-withdrawn"
        : "choreography-deleted",
    );
  }

  throw new Response(unsupportedActionMessage, { status: 400 });
}

/**
 * An unevaluated presentation is not a blocker: it is deleted with the
 * choreography —whether the outcome is a delete or a withdrawal— in the same
 * transaction and without a cascade, and the number it held stays a gap in the
 * order. What the academies were told about every other number does not change
 * because one choreography left.
 *
 * Money is not a blocker either. The action is never refused because of it: it
 * picks between deleting and withdrawing inside the write's transaction, so the
 * outcome the dialog announced can only improve into the conservative one.
 *
 * The one refusal left is the evaluated presentation, and it refuses both
 * outcomes: competitive history is never lost. It is re-read inside the
 * transaction, under the choreography's row lock, so the blockers the loader
 * rendered the dialog with cannot go stale between the render and the click.
 */
async function deleteChoreography(choreography: ChoreographyDetail) {
  if (getChoreographyDeleteBlockers(choreography).length > 0) {
    throw evaluatedPresentationResponse();
  }

  const outcome = await removeChoreography(choreography.id);

  if (outcome === "evaluated") {
    throw evaluatedPresentationResponse();
  }

  return outcome;
}

function evaluatedPresentationResponse() {
  return new Response("No se puede eliminar esta coreografía.", {
    status: 409,
  });
}

function getChoreographyDeleteBlockers(
  choreography: Pick<ChoreographyDetail, "isEvaluated" | "isWithdrawn">,
): ChoreographyDeleteBlocker[] {
  if (choreography.isWithdrawn) {
    return [{ code: "withdrawn", label: "La coreografía está retirada." }];
  }

  if (!choreography.isEvaluated) {
    return [];
  }

  return [
    {
      code: "evaluated-presentation",
      label: "La presentación ya fue evaluada.",
    },
  ];
}

/**
 * The choreography the URL names in the active event, or its 404, so the
 * loader and the action refuse it alike.
 */
async function findRoutedChoreography(input: {
  params: ChoreographyDetailParams;
  selectedEventId: string | null;
}) {
  const { choreographyId } = input.params;
  const selectedEventId = input.selectedEventId;
  const notFound = new Response(choreographyNotFoundMessage, { status: 404 });

  if (!choreographyId || !selectedEventId) {
    throw notFound;
  }

  const choreography = await findChoreographyDetail({
    choreographyId,
    selectedEventId,
  });

  if (!choreography) {
    throw notFound;
  }

  return { choreography, selectedEventId };
}

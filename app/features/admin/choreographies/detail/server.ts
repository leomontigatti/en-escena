import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { choreographyHasComprobantes } from "@/lib/comprobantes/comprobantes.server";
import { hasFrozenPriceInscription } from "@/lib/finances/choreography-frozen-price-guard.server";
import { updateAdministrativeChoreographyRoster } from "@/lib/choreographies/choreography-roster-admin.server";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import {
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
} from "@/lib/choreographies/choreography-roster-options.server";
import { resolveChoreographyDancers } from "@/lib/choreographies/choreography-roster.server";
import type {
  ChoreographyDancerOption,
  ChoreographyProfessorOption,
} from "@/lib/choreographies/choreography-roster.shared";
import { getFieldErrors } from "@/lib/shared/form-validation";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";

import {
  findChoreographyDetail,
  type ChoreographyDetail,
} from "./choreography-queries.server";
import { updateChoreographyExperienceLevel } from "./experience-level.server";
import {
  listChoreographyModalityOptions,
  resolveChoreographyModalityCorrection,
  toChoreographyModalityBlockers,
  updateChoreographyModality,
  type ChoreographyModalityOption,
  type ChoreographyModalityResolutionResult,
} from "./modality.server";
import {
  listSubmodalitiesForModality,
  updateChoreographySubmodality,
} from "./submodality.server";
import {
  resolveChoreographyScheduleCapacityOptions,
  toScheduleCapacityBlockers,
  updateChoreographyScheduleCapacity,
  type ChoreographyScheduleCapacityReassignment,
} from "./schedule-capacity.server";
import {
  canCorrectChoreographyModality,
  canReassignExperienceLevel,
  canReassignScheduleCapacity,
  choreographyFieldNames,
  deleteChoreographyIntent,
  modalityFieldNames,
  renameChoreographyIntent,
  resolveChoreographyModalityIntent,
  resolveChoreographyRosterIntent,
  updateChoreographyExperienceLevelIntent,
  updateChoreographyModalityIntent,
  updateChoreographyRosterIntent,
  updateChoreographyScheduleCapacityIntent,
  updateChoreographySubmodalityIntent,
  type ChoreographyActionData,
  choreographySavedSuccess,
  type ChoreographyDeleteBlocker,
  type ChoreographyFieldUpdateErrorData,
  type ChoreographyModalityBlocker,
  type ChoreographyRosterErrorData,
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
  };
  experienceLevel: {
    canReassign: boolean;
  };
  modality: {
    blockers: ChoreographyModalityBlocker[];
    canCorrect: boolean;
    options: ChoreographyModalityOption[];
  };
  scheduleCapacity: ChoreographyScheduleCapacityReassignment;
  selectedEventId: string | null;
  submodalityOptions: Array<{ id: string; name: string }>;
};

const renameChoreographySchema = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
});

const unsupportedActionMessage = "Acción no soportada.";

export async function loadChoreographyDetailRouteData(input: {
  request: Request;
  params: { choreographyId?: string };
}): Promise<ChoreographyDetailLoaderData> {
  const user = await requireInternalUser(input.request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const choreographyId = readChoreographyId(input.params);
  const selectedEventId = eventContext.selectedEventId;
  const choreography = selectedEventId
    ? await findChoreographyDetail({
        choreographyId,
        selectedEventId,
      })
    : null;

  if (!selectedEventId || !choreography) {
    throw new Response(choreographyNotFoundMessage, {
      status: 404,
    });
  }

  const canEdit = user.role === "admin";
  const [
    blockers,
    availableDancers,
    availableProfessors,
    submodalityOptions,
    scheduleCapacityOptions,
    hasFrozenPrice,
    modalityOptions,
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
    listSubmodalitiesForModality(choreography.modalityId),
    resolveChoreographyScheduleCapacityOptions({
      choreography,
      eventId: selectedEventId,
    }),
    hasFrozenPriceInscription(choreography.id),
    listChoreographyModalityOptions(selectedEventId),
  ]);
  const scheduleCapacityBlockers = toScheduleCapacityBlockers(hasFrozenPrice);

  return {
    availableDancers,
    availableProfessors,
    backToList: "/administracion/coreografias",
    canEdit,
    choreography,
    deletion: {
      blockers,
      canDelete: blockers.length === 0,
    },
    experienceLevel: {
      // No blockers to list: the level is not a price key, so the only underlying
      // condition is that the category declares it. The reason a presentation
      // closes it goes in the alert that already lists it.
      canReassign: canReassignExperienceLevel({
        canEdit,
        hasPresentation: choreography.hasPresentation,
        requiresExperienceLevel: choreography.requiresExperienceLevel,
      }),
    },
    modality: {
      // The deposit does not close the field: it is listed as a blocker-in-waiting,
      // because it only rejects the save when the correction would move the
      // cronograma.
      blockers: toChoreographyModalityBlockers(hasFrozenPrice),
      canCorrect: canCorrectChoreographyModality({
        canEdit,
        hasPresentation: choreography.hasPresentation,
      }),
      options: modalityOptions,
    },
    scheduleCapacity: {
      // The reasons go to the view even when the field is already closed by
      // another cause: the page's alert lists them for the auditor too.
      blockers: scheduleCapacityBlockers,
      // Reassigning is an administrative correction: `admin` only, never with a
      // presentation, never with a frozen `Seña`, and only when there is more
      // than one compatible capacity to choose between. A choreography already
      // presented has its schedule as closed as its roster.
      canReassign: canReassignScheduleCapacity({
        blockers: scheduleCapacityBlockers,
        canEdit,
        hasMultipleCompatibleOptions:
          scheduleCapacityOptions.hasMultipleCompatibleOptions,
        hasPresentation: choreography.hasPresentation,
      }),
      options: scheduleCapacityOptions.options.map((option) => ({
        id: option.id,
        isFull: option.isFull,
        label: option.label,
      })),
    },
    selectedEventId,
    submodalityOptions,
  };
}

export type ChoreographyRosterResolutionData = {
  intent: typeof resolveChoreographyRosterIntent;
  result: Awaited<ReturnType<typeof resolveChoreographyDancers>>;
};

export type ChoreographyModalityResolutionData = {
  intent: typeof resolveChoreographyModalityIntent;
  result: ChoreographyModalityResolutionResult;
};

export type ChoreographyDetailActionData =
  | ChoreographyActionData
  | ChoreographyModalityResolutionData
  | ChoreographyRosterErrorData
  | ChoreographyRosterResolutionData
  | ChoreographyFieldUpdateErrorData
  | ChoreographySuccessData;

export async function handleChoreographyDetailAction(input: {
  request: Request;
  params: { choreographyId?: string };
}): Promise<ChoreographyDetailActionData | Response> {
  await requireAdminUser(input.request);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const selectedEventId = eventContext.selectedEventId;
  const choreographyId = readChoreographyId(input.params);

  if (!selectedEventId) {
    throw new Response(choreographyNotFoundMessage, {
      status: 404,
    });
  }

  const choreography = await findChoreographyDetail({
    choreographyId,
    selectedEventId,
  });

  if (!choreography) {
    throw new Response(choreographyNotFoundMessage, {
      status: 404,
    });
  }

  const formData = await input.request.formData();
  const intent = formData.get("intent");

  if (intent === renameChoreographyIntent) {
    return await renameChoreography({
      choreographyId,
      formData,
    });
  }

  if (intent === deleteChoreographyIntent) {
    await deleteChoreography(choreography);
    return redirectWithFlashNotification(
      "/administracion/coreografias",
      "coreografia-eliminada",
    );
  }

  if (intent === resolveChoreographyRosterIntent) {
    return {
      intent: resolveChoreographyRosterIntent,
      result: await resolveChoreographyDancers({
        academyId: choreography.academyId,
        choreographyId,
        dancerIds: readFormStringArray(formData, "dancerIds"),
        eventId: selectedEventId,
      }),
    };
  }

  if (intent === updateChoreographyRosterIntent) {
    return await updateChoreographyRosterAction({
      choreography,
      eventId: selectedEventId,
      formData,
    });
  }

  if (intent === resolveChoreographyModalityIntent) {
    return {
      intent: resolveChoreographyModalityIntent,
      result: await resolveChoreographyModalityCorrection({
        choreography,
        eventId: selectedEventId,
        modalityId: readFormString(formData, modalityFieldNames.modalityId),
      }),
    };
  }

  if (intent === updateChoreographyModalityIntent) {
    return await updateChoreographyModality({
      choreography,
      eventId: selectedEventId,
      formData,
    });
  }

  if (intent === updateChoreographySubmodalityIntent) {
    return await updateChoreographySubmodality({
      choreography,
      formData,
    });
  }

  if (intent === updateChoreographyScheduleCapacityIntent) {
    return await updateChoreographyScheduleCapacity({
      choreography,
      eventId: selectedEventId,
      formData,
    });
  }

  if (intent === updateChoreographyExperienceLevelIntent) {
    return await updateChoreographyExperienceLevel({
      choreography,
      formData,
    });
  }

  throw new Response(unsupportedActionMessage, { status: 400 });
}

async function renameChoreography(input: {
  choreographyId: string;
  formData: FormData;
}): Promise<ChoreographyActionData | ChoreographySuccessData> {
  const values = {
    name: readFormString(input.formData, "name"),
  };
  const parsed = renameChoreographySchema.safeParse(values);

  if (!parsed.success) {
    return {
      fieldErrors: getFieldErrors(parsed.error, choreographyFieldNames),
      message: "Revisá los campos marcados.",
      status: "error",
      values,
    } satisfies ChoreographyActionData;
  }

  await db
    .update(choreographies)
    .set({
      name: parsed.data.name,
      updatedAt: new Date(),
    })
    .where(eq(choreographies.id, input.choreographyId));

  return choreographySavedSuccess();
}

async function updateChoreographyRosterAction(input: {
  choreography: ChoreographyDetail;
  eventId: string;
  formData: FormData;
}): Promise<
  | ChoreographyActionData
  | ChoreographyFieldUpdateErrorData
  | ChoreographyRosterErrorData
  | ChoreographySuccessData
> {
  // `name` is optional: a submit that only touches the roster does not send it
  // and leaves the name intact. When it does arrive, it is validated exactly as
  // in `rename-choreography`.
  let name: string | undefined;

  if (input.formData.has("name")) {
    const parsedName = renameChoreographySchema.safeParse({
      name: readFormString(input.formData, "name"),
    });

    if (!parsedName.success) {
      return {
        fieldErrors: getFieldErrors(parsedName.error, choreographyFieldNames),
        message: "Revisá los campos marcados.",
        status: "error",
        values: { name: readFormString(input.formData, "name") },
      } satisfies ChoreographyActionData;
    }

    name = parsedName.data.name;
  }

  const result = await updateAdministrativeChoreographyRoster({
    academyId: input.choreography.academyId,
    choreographyId: input.choreography.id,
    dancerIds: readFormStringArray(input.formData, "dancerIds"),
    eventId: input.eventId,
    experienceLevelId: readOptionalFormString(
      input.formData,
      "experienceLevelId",
    ),
    name,
    professorIds: readFormStringArray(input.formData, "professorIds"),
    scheduleCapacityId: readOptionalFormString(
      input.formData,
      "scheduleCapacityId",
    ),
  });

  if (!result.ok) {
    // The two cupo-de-cronograma guards (#659) reject a save that the roster
    // section's own error channel would otherwise swallow (see
    // `toChoreographyDetailViewActionData` in `shared.ts`): they surface as a
    // plain `status: "error"` instead of `"roster-error"` so the rejection
    // actually reaches the rendered page.
    if (result.code === "schedule-capacity") {
      return {
        message: result.message,
        status: "error",
      };
    }

    return {
      fieldErrors: result.fieldErrors,
      message: result.message,
      section: result.section,
      status: "roster-error",
    };
  }

  return choreographySavedSuccess();
}

async function deleteChoreography(choreography: ChoreographyDetail) {
  const blockers = await getChoreographyDeleteBlockers(choreography);

  if (blockers.length > 0) {
    throw new Response("No se puede eliminar esta coreografía.", {
      status: 409,
    });
  }

  await db.delete(choreographies).where(eq(choreographies.id, choreography.id));
}

async function getChoreographyDeleteBlockers(
  choreography: Pick<ChoreographyDetail, "hasPresentation" | "id">,
): Promise<ChoreographyDeleteBlocker[]> {
  const [hasScores, hasComprobantes] = await Promise.all([
    hasScoresForChoreography(choreography.id),
    choreographyHasComprobantes(choreography.id),
  ]);
  const blockers: ChoreographyDeleteBlocker[] = [];

  if (choreography.hasPresentation) {
    blockers.push({ code: "presentation", label: "presentación" });
  }

  if (hasScores) {
    blockers.push({ code: "scores", label: "puntajes" });
  }

  // Fiscal history: any ARCA comprobante (in force, annulled or an NC) anchors
  // the choreography irreversibly. It is #340's server-side guard, evaluated here
  // just before the delete in case one was emitted between the render and the
  // click.
  if (hasComprobantes) {
    blockers.push({ code: "comprobantes", label: "comprobantes" });
  }

  return blockers;
}

async function hasScoresForChoreography(_choreographyId: string) {
  return false;
}

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response(choreographyNotFoundMessage, {
      status: 404,
    });
  }

  return params.choreographyId;
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readFormStringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" && value ? [value] : []));
}

function readOptionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" && value.length > 0 ? value : null;
}

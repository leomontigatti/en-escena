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

// Los módulos del detalle importan `ChoreographyDetail` desde acá: es el tipo
// del registro con el que trabaja toda la vista, y su consulta vive aparte.
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
      // Sin bloqueos que enumerar: el nivel no es clave de precio, así que la
      // única condición de fondo es que la categoría lo declare. El motivo por
      // el que la presentación lo cierra va en la alerta que ya la enumera.
      canReassign: canReassignExperienceLevel({
        canEdit,
        hasPresentation: choreography.hasPresentation,
        requiresExperienceLevel: choreography.requiresExperienceLevel,
      }),
    },
    modality: {
      // La seña no cierra el campo: se enumera como bloqueo en potencia, porque
      // solo rechaza el guardado cuando la corrección movería el cronograma.
      blockers: toChoreographyModalityBlockers(hasFrozenPrice),
      canCorrect: canCorrectChoreographyModality({
        canEdit,
        hasPresentation: choreography.hasPresentation,
      }),
      options: modalityOptions,
    },
    scheduleCapacity: {
      // Los motivos van a la vista aunque el campo ya esté cerrado por otra
      // causa: la alerta de la página los enumera también para el auditor.
      blockers: toScheduleCapacityBlockers(hasFrozenPrice),
      // Reasignar es una corrección administrativa: solo `admin`, nunca con
      // presentación, nunca con seña congelada y solo cuando hay más de un cupo
      // compatible entre los que elegir. La coreografía ya presentada tiene el
      // cronograma tan cerrado como el roster.
      canReassign: canReassignScheduleCapacity({
        blockers: toScheduleCapacityBlockers(hasFrozenPrice),
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
  // `name` es opcional: un submit que solo toca el roster no lo manda y deja el
  // nombre intacto. Cuando viene, se valida igual que en `rename-choreography`.
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

  // Historia fiscal: cualquier comprobante ARCA (vigente, anulado o NC) ancla la
  // coreografía de forma irreversible. Guarda server-side de #340, evaluada acá
  // recién antes del borrado por si se emitió entre el render y el click.
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

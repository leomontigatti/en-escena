import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import {
  invalidScheduleEntryMessage,
  lockScheduleCapacityForAssignment,
} from "@/lib/choreographies/schedule-capacity-lock.server";
import { resolveEventBasesScheduleOptions } from "@/lib/events/bases.server";

import type { ChoreographyDetail } from "./server";
import {
  assignedScheduleCapacityFieldName,
  choreographySavedSuccess,
  type ChoreographyFieldUpdateErrorData,
  type ChoreographySuccessData,
} from "./shared";

export type ChoreographyScheduleCapacityOption = {
  id: string;
  label: string;
};

export type ChoreographyScheduleCapacityReassignment = {
  canReassign: boolean;
  options: ChoreographyScheduleCapacityOption[];
};

type ResolvedScheduleCapacityOption = ChoreographyScheduleCapacityOption & {
  scheduleCapacityId: string | null;
  scheduleId: string;
};

/**
 * Un cronograma sin cupo declarado para el tipo de grupo se ofrece igual,
 * contra su capacidad total. El id sintético distingue esa opción global del
 * id de un cupo concreto.
 */
export function getGlobalScheduleCapacityOptionId(scheduleId: string) {
  return `schedule:${scheduleId}:global`;
}

/**
 * Las opciones que la vista ofrece son exactamente las que el intent acepta:
 * los cupos compatibles con el evento, la modalidad y el tipo de grupo de la
 * coreografía, más el cupo asignado hoy. Ese agregado es solo de visibilidad:
 * si la asignación quedó fuera de la compatibilidad (cambió la modalidad del
 * cronograma, se borró el cupo), tiene que seguir a la vista en lugar de
 * desaparecer del select sin explicación.
 */
export async function resolveChoreographyScheduleCapacityOptions(input: {
  choreography: ChoreographyDetail;
  eventId: string;
}): Promise<{
  hasMultipleCompatibleOptions: boolean;
  options: ResolvedScheduleCapacityOption[];
}> {
  const resolution = await resolveEventBasesScheduleOptions({
    eventId: input.eventId,
    groupType: input.choreography.groupType,
    modalityId: input.choreography.modalityId,
  });
  const options: ResolvedScheduleCapacityOption[] = resolution.options.map(
    (option) => ({
      id: option.id,
      label: formatScheduleDateTime(option.schedule),
      scheduleCapacityId: option.scheduleCapacityId,
      scheduleId: option.scheduleId,
    }),
  );

  if (
    !options.some(
      (option) => option.id === input.choreography.scheduleCapacityId,
    )
  ) {
    options.push(toAssignedScheduleCapacityOption(input.choreography));
  }

  return {
    hasMultipleCompatibleOptions: resolution.status === "multiple",
    options,
  };
}

export async function updateChoreographyScheduleCapacity(input: {
  choreography: ChoreographyDetail;
  eventId: string;
  formData: FormData;
}): Promise<ChoreographyFieldUpdateErrorData | ChoreographySuccessData> {
  // Mismo bloqueo duro que el roster y la eliminación: con presentación el
  // cronograma no se toca, aunque el form mande un cupo.
  if (input.choreography.hasPresentation) {
    return {
      message:
        "No se puede cambiar el cupo de cronograma: la coreografía ya tiene presentación.",
      status: "error",
    };
  }

  const { options } = await resolveChoreographyScheduleCapacityOptions({
    choreography: input.choreography,
    eventId: input.eventId,
  });
  const requestedOptionId = readRequestedScheduleCapacityOptionId(
    input.formData,
  );
  const selectedOption = options.find(
    (option) => option.id === requestedOptionId,
  );

  // La compatibilidad se revalida acá y no se confía en lo que mandó el form.
  if (!selectedOption) {
    return {
      message: invalidScheduleEntryMessage,
      status: "error",
    };
  }

  const result = await db.transaction(async (tx) => {
    const lock = await lockScheduleCapacityForAssignment({
      // Sin esta exclusión, reelegir el cupo que la coreografía ya ocupa la
      // contaría contra su propio cupo y lo reportaría como lleno.
      excludeChoreographyId: input.choreography.id,
      scheduleCapacityId: selectedOption.scheduleCapacityId,
      scheduleId: selectedOption.scheduleId,
      tx,
    });

    if (!lock.ok) {
      return lock;
    }

    await tx
      .update(choreographies)
      .set({
        scheduleCapacityId: lock.scheduleCapacityId,
        scheduleId: lock.scheduleId,
        updatedAt: new Date(),
      })
      .where(eq(choreographies.id, input.choreography.id));

    return lock;
  });

  if (!result.ok) {
    return {
      message: result.error,
      status: "error",
    };
  }

  return choreographySavedSuccess();
}

function toAssignedScheduleCapacityOption(
  choreography: ChoreographyDetail,
): ResolvedScheduleCapacityOption {
  const isGlobalOption =
    choreography.scheduleCapacityId ===
    getGlobalScheduleCapacityOptionId(choreography.scheduleId);

  return {
    id: choreography.scheduleCapacityId,
    label: choreography.scheduleLabel,
    scheduleCapacityId: isGlobalOption ? null : choreography.scheduleCapacityId,
    scheduleId: choreography.scheduleId,
  };
}

function readRequestedScheduleCapacityOptionId(formData: FormData) {
  const value = formData.get(assignedScheduleCapacityFieldName);

  return typeof value === "string" && value.length > 0 ? value : null;
}

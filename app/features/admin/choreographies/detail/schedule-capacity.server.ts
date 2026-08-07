import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import {
  appendScheduleOccupancySuffix,
  formatScheduleDateTime,
} from "@/lib/choreographies/schedule-formatters";
import {
  invalidScheduleEntryMessage,
  lockScheduleCapacityForAssignment,
} from "@/lib/choreographies/schedule-capacity-lock.server";
import {
  resolveScheduleCapacityOccupancies,
  toScheduleCapacityOccupancyKey,
} from "@/lib/choreographies/schedule-capacity-occupancy.server";
import { resolveEventBasesScheduleOptions } from "@/lib/events/bases.server";
import { hasFrozenDepositSnapshot } from "@/lib/finances/choreography-deposit-guard.server";

import type { ChoreographyDetail } from "./server";
import {
  assignedScheduleCapacityFieldName,
  choreographySavedSuccess,
  type ChoreographyFieldUpdateErrorData,
  type ChoreographyScheduleCapacityBlocker,
  type ChoreographySuccessData,
} from "./shared";

export type ChoreographyScheduleCapacityOption = {
  id: string;
  /**
   * Sin lugar disponible. La vista lo traduce a `disabled`, que queda
   * reservado exclusivamente para esto: la cuenta corre carrera con cualquier
   * otra asignación, así que la opción gris es una pista, no una barrera, y el
   * rechazo del servidor sigue siendo la única garantía.
   */
  isFull: boolean;
  label: string;
};

export type ChoreographyScheduleCapacityReassignment = {
  blockers: ChoreographyScheduleCapacityBlocker[];
  canReassign: boolean;
  options: ChoreographyScheduleCapacityOption[];
};

/**
 * El bloqueo es de todo el campo, nunca de opciones sueltas: toda opción que el
 * select ofrece cambia el cronograma y con él la clave de precio, así que no
 * hay reasignación financieramente inerte que eximir.
 */
const frozenDepositBlocker: ChoreographyScheduleCapacityBlocker = {
  code: "frozen-deposit",
  label:
    "Al menos una inscripción tiene seña registrada: su precio quedó congelado contra este cronograma.",
};

const frozenDepositMessage =
  "No se puede cambiar el cupo de cronograma: hay inscripciones con seña registrada.";

/**
 * Motivos de bloqueo que el servidor arma para la alerta de la página. No se
 * filtran por rol: el auditor también tiene que ver por qué el cronograma no se
 * puede mover.
 */
export async function resolveScheduleCapacityBlockers(
  choreographyId: string,
): Promise<ChoreographyScheduleCapacityBlocker[]> {
  return (await hasFrozenDepositSnapshot(choreographyId))
    ? [frozenDepositBlocker]
    : [];
}

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
      isFull: false,
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

  const occupancies = await resolveScheduleCapacityOccupancies({
    // Misma exclusión que el lock: la coreografía que se está moviendo no
    // cuenta contra el cupo que ya ocupa.
    excludeChoreographyId: input.choreography.id,
    targets: options,
  });

  return {
    hasMultipleCompatibleOptions: resolution.status === "multiple",
    options: options.map((option) => {
      const occupancy = occupancies.get(toScheduleCapacityOccupancyKey(option));

      return occupancy
        ? {
            ...option,
            isFull: occupancy.isFull,
            label: appendScheduleOccupancySuffix(option.label, occupancy),
          }
        : option;
    }),
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

  // La guarda financiera se revalida en el intent y no solo en el loader: el
  // campo puede haber quedado abierto en una pestaña vieja o llegar un submit
  // armado a mano.
  if (await hasFrozenDepositSnapshot(input.choreography.id)) {
    return {
      message: frozenDepositMessage,
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
    isFull: false,
    label: choreography.scheduleLabel,
    scheduleCapacityId: isGlobalOption ? null : choreography.scheduleCapacityId,
    scheduleId: choreography.scheduleId,
  };
}

function readRequestedScheduleCapacityOptionId(formData: FormData) {
  const value = formData.get(assignedScheduleCapacityFieldName);

  return typeof value === "string" && value.length > 0 ? value : null;
}

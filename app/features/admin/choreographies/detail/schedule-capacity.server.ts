import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import { getGlobalScheduleCapacityOptionId } from "@/lib/choreographies/choreography-roster.shared";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import {
  guardAndLockScheduleCapacityMove,
  invalidScheduleEntryMessage,
} from "@/lib/choreographies/schedule-capacity-lock.server";
import type { ScheduleCapacitySelectOption } from "@/lib/choreographies/schedule-capacity-options";
import { withScheduleCapacityOccupancy } from "@/lib/choreographies/schedule-capacity-options.server";
import { resolveEventBasesScheduleOptions } from "@/lib/events/bases.server";

import type { ChoreographyDetail } from "./server";
import {
  assignedScheduleCapacityFieldName,
  choreographySavedSuccess,
  type ChoreographyFieldUpdateErrorData,
  type ChoreographyScheduleCapacityBlocker,
  type ChoreographySuccessData,
} from "./shared";

export type ChoreographyScheduleCapacityOption = ScheduleCapacitySelectOption;

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
const frozenPriceBlocker: ChoreographyScheduleCapacityBlocker = {
  code: "frozen-price",
  label:
    "Al menos una inscripción tiene dinero asignado: su precio quedó congelado contra este cronograma.",
};

/**
 * Motivos de bloqueo que el servidor arma para la alerta de la página. No se
 * filtran por rol: el auditor también tiene que ver por qué el cronograma no se
 * puede mover.
 *
 * The caller reads the money once and derives both this list and the modality
 * one from it: the two alerts describe the same inscriptions.
 */
export function toScheduleCapacityBlockers(
  hasFrozenPrice: boolean,
): ChoreographyScheduleCapacityBlocker[] {
  return hasFrozenPrice ? [frozenPriceBlocker] : [];
}

type ResolvedScheduleCapacityOption = ChoreographyScheduleCapacityOption & {
  scheduleCapacityId: string | null;
  scheduleId: string;
};

type ScheduleCapacityOptionCandidate = Omit<
  ResolvedScheduleCapacityOption,
  "isFull"
>;

/**
 * Las opciones que la vista ofrece son exactamente las que el intent acepta:
 * los cupos compatibles con el evento, la modalidad y el tipo de grupo de la
 * coreografía, más el cupo asignado hoy. Ese agregado es solo de visibilidad:
 * si la asignación quedó fuera de la compatibilidad (cambió la modalidad del
 * cronograma, se borró el cupo), tiene que seguir a la vista en lugar de
 * desaparecer del select sin explicación.
 *
 * Sin ocupación: el intent solo necesita saber qué ids acepta, y contar
 * ocupantes para rotular opciones que nadie va a leer es trabajo tirado. La
 * vista pasa por `resolveChoreographyScheduleCapacityOptions`.
 */
async function resolveScheduleCapacityCandidates(input: {
  choreography: ChoreographyDetail;
  eventId: string;
}): Promise<{
  hasMultipleCompatibleOptions: boolean;
  options: ScheduleCapacityOptionCandidate[];
}> {
  const resolution = await resolveEventBasesScheduleOptions({
    eventId: input.eventId,
    groupType: input.choreography.groupType,
    modalityId: input.choreography.modalityId,
  });
  const options: ScheduleCapacityOptionCandidate[] = resolution.options.map(
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

/**
 * Las mismas opciones que acepta el intent, rotuladas con la ocupación y con
 * las llenas marcadas, para el select del detalle.
 */
export async function resolveChoreographyScheduleCapacityOptions(input: {
  choreography: ChoreographyDetail;
  eventId: string;
}): Promise<{
  hasMultipleCompatibleOptions: boolean;
  options: ResolvedScheduleCapacityOption[];
}> {
  const candidates = await resolveScheduleCapacityCandidates(input);

  return {
    hasMultipleCompatibleOptions: candidates.hasMultipleCompatibleOptions,
    options: await withScheduleCapacityOccupancy({
      // Misma exclusión que el lock: la coreografía que se está moviendo no
      // cuenta contra el cupo que ya ocupa.
      excludeChoreographyId: input.choreography.id,
      options: candidates.options,
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

  const { hasMultipleCompatibleOptions, options } =
    await resolveScheduleCapacityCandidates({
      choreography: input.choreography,
      eventId: input.eventId,
    });

  // La misma condición que cierra el campo en el loader. Sin ella el intent
  // acepta un movimiento que la vista se niega a ofrecer: con un solo cupo
  // compatible el select queda de solo lectura, pero un POST armado a mano que
  // nombre ese cupo movería la clave de precio igual.
  if (!hasMultipleCompatibleOptions) {
    return {
      message:
        "No se puede cambiar el cupo de cronograma: no hay otro cronograma compatible con esta coreografía.",
      status: "error",
    };
  }

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
    // The guard is re-checked on the intent and not only in the loader (the
    // field may have been left open in a stale tab, or the submit may be
    // hand-crafted), and re-checked *inside* the transaction together with
    // the lock: reading it outside, or before opening one, left a window in
    // which an allocation landing in between went unnoticed and the schedule
    // moved anyway. Same guard-then-lock pair as the roster path, so the two
    // entry points can't drift on order or on which move counts as frozen.
    const move = await guardAndLockScheduleCapacityMove({
      choreographyId: input.choreography.id,
      scheduleCapacityId: selectedOption.scheduleCapacityId,
      scheduleId: selectedOption.scheduleId,
      tx,
    });

    if (!move.ok) {
      return move;
    }

    await tx
      .update(choreographies)
      .set({
        scheduleCapacityId: move.scheduleCapacityId,
        scheduleId: move.scheduleId,
        updatedAt: new Date(),
      })
      .where(eq(choreographies.id, input.choreography.id));

    return move;
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
): ScheduleCapacityOptionCandidate {
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

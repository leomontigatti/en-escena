import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import { getGlobalScheduleCapacityOptionId } from "@/lib/choreographies/choreography-roster.shared";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import {
  invalidScheduleEntryMessage,
  lockScheduleCapacityForAssignment,
} from "@/lib/choreographies/schedule-capacity-lock.server";
import type { ScheduleCapacitySelectOption } from "@/lib/choreographies/schedule-capacity-options";
import { withScheduleCapacityOccupancy } from "@/lib/choreographies/schedule-capacity-options.server";
import { resolveEventBasesScheduleOptions } from "@/lib/events/bases.server";
import { hasPriceLockedInscription } from "@/lib/finances/choreography-price-lock-guard.server";

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
  return (await hasPriceLockedInscription(choreographyId))
    ? [frozenDepositBlocker]
    : [];
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
    // La guarda financiera se revalida en el intent y no solo en el loader (el
    // campo puede haber quedado abierto en una pestaña vieja o llegar un submit
    // armado a mano), y se revalida *dentro* de la transacción: leerla antes de
    // abrirla dejaba una ventana en la que una seña registrada en el medio se
    // perdía y el cronograma se movía igual.
    if (await hasPriceLockedInscription(input.choreography.id, tx)) {
      return {
        ok: false as const,
        error: frozenDepositMessage,
      };
    }

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

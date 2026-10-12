import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, schedules } from "@/db/schema";
import {
  eventBaseEntityNotFound,
  type EventBaseFailure,
  hasOccupyingChoreographies,
  uniqueValues,
  type EventBasesExecutor,
  type EventBasesTransaction,
} from "@/lib/events/bases-kernel.server";
import { isScheduleCoveredByPrice } from "@/lib/prices/price-schedules.server";
import { resolveOccupiedCounts } from "@/lib/choreographies/schedule-capacity-occupancy.server";
import { listExcludedOccupiedCategories } from "@/lib/schedules/accepted-categories.server";
import { listExcludedOccupiedModalities } from "@/lib/schedules/accepted-modalities.server";
import type {
  ScheduleDependencies,
  ScheduleInput,
} from "@/lib/schedules/repository.server";
import { normalizeTime } from "@/lib/schedules/schedule-values.server";

/**
 * What an edit may not restructure on a schedule that is already in use: the
 * frozen date and time, the accepted modalities and categories an occupying
 * choreography still needs, and a total capacity below what is occupied.
 */

type ExistingSchedule = typeof schedules.$inferSelect;

export async function scheduleHasOperationalDependencies(
  scheduleId: string,
  executor: EventBasesExecutor = db,
) {
  if (await isScheduleCoveredByPrice(executor, scheduleId)) {
    return true;
  }

  return hasOccupyingChoreographies(
    eq(choreographies.scheduleId, scheduleId),
    executor,
  );
}

/**
 * The structural validation below, run as one critical section with the edit's
 * write. Restoring a choreography and every assignment path lock this same row
 * before reading what the schedule accepts, so once the edit holds it no
 * choreography can land between the check and the commit: without the lock, a
 * choreography placed concurrently would be left on a schedule that no longer
 * accepts its modality or category, or over a capacity smaller than its
 * occupants. The row is re-read under the lock, so the check compares against
 * the schedule as it stands, not as it was before the transaction.
 */
export async function validateStructuralScheduleChangesLocked(
  tx: EventBasesTransaction,
  scheduleId: string,
  input: ScheduleInput,
  dependencies: ScheduleDependencies,
): Promise<EventBaseFailure | null> {
  const [locked] = await tx
    .select()
    .from(schedules)
    .where(eq(schedules.id, scheduleId))
    .for("update");

  if (!locked) {
    return eventBaseEntityNotFound("schedule");
  }

  return validateStructuralScheduleChanges(
    tx,
    locked,
    input,
    dependencies.hasDependencies ??
      ((id) => scheduleHasOperationalDependencies(id, tx)),
  );
}

/**
 * Date and time freeze once the schedule has dependencies: choreographies were
 * placed and priced against them. The accepted modalities and categories do
 * not: adding either only widens what the schedule accepts, and prices are
 * keyed by schedule and group type, not by modality or category. Narrowing
 * them is what turns an existing schedule into "Función 1" once the older
 * choreographies were moved away, so it is refused only when a choreography
 * still occupying the schedule would be left out. The total capacity follows
 * the same idea: it may move freely as long as it still holds what already
 * occupies the schedule, which is the only thing a smaller number could break.
 */
async function validateStructuralScheduleChanges(
  tx: EventBasesTransaction,
  existing: ExistingSchedule,
  input: ScheduleInput,
  hasDependencies: (scheduleId: string) => boolean | Promise<boolean>,
): Promise<EventBaseFailure | null> {
  if (
    hasFrozenScheduleChanges(existing, input) &&
    (await hasDependencies(existing.id))
  ) {
    return {
      ok: false,
      code: "schedule-has-dependencies",
      error:
        "No se pueden editar fecha ni hora porque el cronograma tiene dependencias.",
    };
  }

  const excludedModalityNames = await listExcludedOccupiedModalities(
    tx,
    existing.id,
    uniqueValues(input.modalityIds),
  );

  if (excludedModalityNames.length > 0) {
    return {
      ok: false,
      code: "schedule-has-dependencies",
      error: `No se pueden quitar modalidades con coreografías asignadas al cronograma: ${excludedModalityNames.join(", ")}.`,
      fieldErrors: { modalityIds: "Ajustá las modalidades aceptadas." },
    };
  }

  const excludedCategoryNames = await listExcludedOccupiedCategories(
    tx,
    existing.id,
    uniqueValues(input.categoryIds ?? []),
  );

  if (excludedCategoryNames.length > 0) {
    return {
      ok: false,
      code: "schedule-has-dependencies",
      error: `No se pueden excluir categorías con coreografías asignadas al cronograma: ${excludedCategoryNames.join(", ")}.`,
      fieldErrors: { categoryIds: "Ajustá las categorías aceptadas." },
    };
  }

  if (existing.totalCapacity === input.totalCapacity) {
    return null;
  }

  const occupiedCount = await getScheduleOccupiedCount(tx, existing.id);

  if (input.totalCapacity < occupiedCount) {
    return {
      ok: false,
      code: "schedule-has-dependencies",
      error: `El cupo total no puede ser menor a los ${occupiedCount} lugares ya ocupados del cronograma.`,
      fieldErrors: { totalCapacity: "Ajustá el cupo." },
    };
  }

  return null;
}

async function getScheduleOccupiedCount(
  tx: EventBasesTransaction,
  scheduleId: string,
) {
  const target = { scheduleCapacityId: null, scheduleId };
  const readOccupiedCount = await resolveOccupiedCounts([target], tx);

  return readOccupiedCount(target);
}

function hasFrozenScheduleChanges(
  existing: ExistingSchedule,
  input: ScheduleInput,
) {
  return (
    existing.scheduledDate !== input.scheduledDate ||
    existing.startTime !== normalizeTime(input.startTime)
  );
}

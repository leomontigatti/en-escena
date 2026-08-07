import { and, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, schedules, scheduleCapacities } from "@/db/schema";

export type ScheduleCapacityOccupancy = {
  capacity: number;
  isFull: boolean;
  occupiedCount: number;
};

export type ScheduleCapacityOccupancyTarget = {
  scheduleCapacityId: string | null;
  scheduleId: string;
};

/**
 * Cuenta las coreografías ya asignadas a cada cupo candidato para que la vista
 * pueda mostrar la ocupación real y deshabilitar los llenos. Es una foto, no
 * una reserva: el número corre carrera con cualquier otra asignación, así que
 * `lockScheduleCapacityForAssignment` sigue siendo la única garantía. Por eso
 * acá no se toma ningún lock.
 *
 * `excludeChoreographyId` refleja la exclusión del lock: la coreografía que se
 * está moviendo no cuenta contra el cupo que ya ocupa, o su propia opción se
 * vería llena y deshabilitada mientras el servidor la acepta.
 */
export async function resolveScheduleCapacityOccupancies(input: {
  excludeChoreographyId?: string;
  targets: readonly ScheduleCapacityOccupancyTarget[];
}): Promise<Map<string, ScheduleCapacityOccupancy>> {
  const occupancies = new Map<string, ScheduleCapacityOccupancy>();
  const scheduleIds = [
    ...new Set(input.targets.map((target) => target.scheduleId)),
  ];
  const scheduleCapacityIds = [
    ...new Set(
      input.targets
        .map((target) => target.scheduleCapacityId)
        .filter((id): id is string => id !== null),
    ),
  ];

  if (scheduleIds.length === 0) {
    return occupancies;
  }

  const excludedChoreographyFilter = input.excludeChoreographyId
    ? ne(choreographies.id, input.excludeChoreographyId)
    : undefined;
  const [scheduleRows, scheduleCapacityRows, scheduleCounts, capacityCounts] =
    await Promise.all([
      db
        .select({ id: schedules.id, totalCapacity: schedules.totalCapacity })
        .from(schedules)
        .where(inArray(schedules.id, scheduleIds)),
      scheduleCapacityIds.length > 0
        ? db
            .select({
              capacity: scheduleCapacities.capacity,
              id: scheduleCapacities.id,
            })
            .from(scheduleCapacities)
            .where(inArray(scheduleCapacities.id, scheduleCapacityIds))
        : [],
      countChoreographiesBySchedule({
        excludedChoreographyFilter,
        scheduleIds,
      }),
      scheduleCapacityIds.length > 0
        ? countChoreographiesByScheduleCapacity({
            excludedChoreographyFilter,
            scheduleCapacityIds,
          })
        : new Map<string, number>(),
    ]);

  const totalCapacityByScheduleId = new Map(
    scheduleRows.map((row) => [row.id, row.totalCapacity]),
  );
  const capacityByScheduleCapacityId = new Map(
    scheduleCapacityRows.map((row) => [row.id, row.capacity]),
  );

  for (const target of input.targets) {
    const scheduleTotalCapacity = totalCapacityByScheduleId.get(
      target.scheduleId,
    );

    if (scheduleTotalCapacity === undefined) {
      continue;
    }

    const scheduleOccupiedCount = scheduleCounts.get(target.scheduleId) ?? 0;
    const isScheduleFull = scheduleOccupiedCount >= scheduleTotalCapacity;

    if (target.scheduleCapacityId === null) {
      occupancies.set(toScheduleCapacityOccupancyKey(target), {
        capacity: scheduleTotalCapacity,
        isFull: isScheduleFull,
        occupiedCount: scheduleOccupiedCount,
      });
      continue;
    }

    const capacity = capacityByScheduleCapacityId.get(
      target.scheduleCapacityId,
    );

    if (capacity === undefined) {
      continue;
    }

    const occupiedCount = capacityCounts.get(target.scheduleCapacityId) ?? 0;

    occupancies.set(toScheduleCapacityOccupancyKey(target), {
      capacity,
      // El cupo puntual puede tener lugar y el cronograma no: el servidor
      // rechaza en los dos casos, así que la opción se ve llena en los dos.
      isFull: occupiedCount >= capacity || isScheduleFull,
      occupiedCount,
    });
  }

  return occupancies;
}

export function toScheduleCapacityOccupancyKey(
  target: ScheduleCapacityOccupancyTarget,
) {
  return `${target.scheduleId}:${target.scheduleCapacityId ?? ""}`;
}

/**
 * Una coreografía ocupa el cronograma tanto si lo tiene asignado directo como
 * si llegó a él por su cupo, igual que en el conteo del lock.
 *
 * La atribución acá es de a uno: el `or` alcanza la fila por cualquiera de los
 * dos caminos, pero el `group by coalesce(...)` la suma a un solo cronograma.
 * El lock usa el mismo `or` sin agrupar, así que suma la fila a los dos. Los
 * dos conteos coinciden solo porque `scheduleId` y el `scheduleId` del cupo son
 * siempre el mismo cronograma — invariante que hoy sostienen el registro, el
 * camino de elenco y la reasignación del detalle, que escriben el par junto.
 * Quien rompa esa invariante rompe este contador antes que el lock: este
 * mostraría lugar donde el lock rechaza.
 */
async function countChoreographiesBySchedule(input: {
  excludedChoreographyFilter: ReturnType<typeof ne> | undefined;
  scheduleIds: string[];
}) {
  const effectiveScheduleId = sql<string>`coalesce(${scheduleCapacities.scheduleId}, ${choreographies.scheduleId})`;
  const rows = await db
    .select({
      occupiedCount: sql<number>`count(*)`,
      scheduleId: effectiveScheduleId,
    })
    .from(choreographies)
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .where(
      and(
        or(
          inArray(choreographies.scheduleId, input.scheduleIds),
          inArray(scheduleCapacities.scheduleId, input.scheduleIds),
        ),
        input.excludedChoreographyFilter,
      ),
    )
    .groupBy(effectiveScheduleId);

  return new Map(
    rows.map((row) => [row.scheduleId, Number(row.occupiedCount)]),
  );
}

async function countChoreographiesByScheduleCapacity(input: {
  excludedChoreographyFilter: ReturnType<typeof ne> | undefined;
  scheduleCapacityIds: string[];
}) {
  const rows = await db
    .select({
      occupiedCount: sql<number>`count(*)`,
      scheduleCapacityId: choreographies.scheduleCapacityId,
    })
    .from(choreographies)
    .where(
      and(
        isNotNull(choreographies.scheduleCapacityId),
        inArray(choreographies.scheduleCapacityId, input.scheduleCapacityIds),
        input.excludedChoreographyFilter,
      ),
    )
    .groupBy(choreographies.scheduleCapacityId);

  return new Map(
    rows.map((row) => [
      row.scheduleCapacityId ?? "",
      Number(row.occupiedCount),
    ]),
  );
}

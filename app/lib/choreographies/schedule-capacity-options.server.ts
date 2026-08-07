import { appendScheduleOccupancySuffix } from "@/lib/choreographies/schedule-formatters";
import {
  resolveScheduleCapacityOccupancies,
  toScheduleCapacityOccupancyKey,
} from "@/lib/choreographies/schedule-capacity-occupancy.server";

type LabeledScheduleCapacityOption = {
  label: string;
  scheduleCapacityId: string | null;
  scheduleId: string;
};

/**
 * Agrega la ocupación al rótulo de cada opción y marca las llenas. Es el único
 * lugar donde se arman opciones de cupo con ocupación: administración y el
 * registro del portal pasan por acá para que las dos superficies muestren lo
 * mismo.
 *
 * El sufijo se compone acá y no dentro de `formatScheduleDateTime` porque el
 * mismo formateador rotula el cronograma ya asignado, donde decir cuántos
 * lugares quedan no significa nada.
 *
 * `excludeChoreographyId` refleja la exclusión del lock: la coreografía que se
 * está moviendo no cuenta contra el cupo que ya ocupa.
 */
export async function withScheduleCapacityOccupancy<
  TOption extends LabeledScheduleCapacityOption,
>(input: {
  excludeChoreographyId?: string;
  options: readonly TOption[];
}): Promise<(TOption & { isFull: boolean })[]> {
  const occupancies = await resolveScheduleCapacityOccupancies({
    excludeChoreographyId: input.excludeChoreographyId,
    targets: input.options,
  });

  return input.options.map((option) => {
    const occupancy = occupancies.get(toScheduleCapacityOccupancyKey(option));

    if (!occupancy) {
      return { ...option, isFull: false };
    }

    return {
      ...option,
      isFull: occupancy.isFull,
      label: appendScheduleOccupancySuffix(option.label, occupancy),
    };
  });
}

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
 * Adds occupancy to each option's label and marks the full ones. It is the only
 * place where capacity options with occupancy are built: administration and
 * portal registration both go through here so the two surfaces show the same
 * thing.
 *
 * The suffix is composed here and not inside `formatScheduleDateTime` because
 * the same formatter labels the already assigned schedule, where saying how many
 * places are left means nothing.
 *
 * `excludeChoreographyId` mirrors the lock's exclusion: the choreography being
 * moved does not count against the capacity it already occupies.
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

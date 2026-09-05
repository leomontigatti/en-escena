import { appendScheduleOccupancySuffix } from "@/lib/choreographies/schedule-formatters";
import {
  resolveScheduleCapacityOccupancies,
  type ScheduleCapacityOccupancyTarget,
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
 * thing. A capacity that is never offered as an option carries no label to
 * append the suffix to; `isScheduleCapacityFull` next door reads its fullness
 * without building one.
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

/**
 * Whether a capacity nobody chooses has room. The non-choice of an `auto`
 * status carries no label —saying how many places are left on a field nobody
 * can change means nothing—, so there is nothing for
 * `withScheduleCapacityOccupancy` to suffix; a full one is still the dead end
 * the view explains instead of previewing, and that is what this reads.
 *
 * A capacity the occupancy read does not know is not full: the same answer
 * `withScheduleCapacityOccupancy` gives, kept here so the two cannot drift.
 */
export async function isScheduleCapacityFull(input: {
  excludeChoreographyId?: string;
  target: ScheduleCapacityOccupancyTarget;
}) {
  const occupancies = await resolveScheduleCapacityOccupancies({
    excludeChoreographyId: input.excludeChoreographyId,
    targets: [input.target],
  });

  return (
    occupancies.get(toScheduleCapacityOccupancyKey(input.target))?.isFull ??
    false
  );
}

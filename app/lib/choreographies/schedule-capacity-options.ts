import type { GroupType } from "@/lib/events/group-types";

/**
 * The one rule that places a choreography inside a schedule: the
 * `Cupo de cronograma` for its `Tipo de grupo` when the schedule declares one,
 * and otherwise nothing — meaning the schedule's total capacity, taken as a
 * global allowance. Registration resolves its options with it and restoring a
 * withdrawn choreography re-resolves its place with it, so the two cannot place
 * the same choreography differently.
 */
export function selectScheduleCapacityForGroupType<
  TScheduleCapacity extends { groupType: string },
>(
  scheduleCapacities: readonly TScheduleCapacity[],
  groupType: GroupType,
): TScheduleCapacity | null {
  return (
    scheduleCapacities.find(
      (scheduleCapacity) => scheduleCapacity.groupType === groupType,
    ) ?? null
  );
}

export type ScheduleCapacitySelectOption = {
  id: string;
  /**
   * No room available. The view translates it to `disabled`, which is reserved
   * exclusively for this: the count races with any other assignment, so the greyed
   * option is a hint, not a barrier, and the server's rejection remains the only
   * guarantee.
   */
  isFull: boolean;
  label: string;
};

/**
 * `disabled` is reserved exclusively for a full capacity: no other cause greys
 * out an individual option — the financial block, for instance, closes the whole
 * field — so the greyed option has a single meaning. And since occupancy is a
 * snapshot that races with other assignments, it is a hint: the server's
 * rejection remains the guarantee.
 *
 * Administration and the portal build their options here, so the two surfaces
 * cannot diverge.
 */
export function toScheduleCapacitySelectOptions(
  options: readonly ScheduleCapacitySelectOption[],
) {
  return options.map((option) => ({
    disabled: option.isFull,
    label: option.label,
    value: option.id,
  }));
}

/**
 * A select where nothing is selectable is a silent dead end: the portal, which
 * registers rather than corrects, replaces it with a message saying why.
 *
 * Occupancy is all it reads, never a label, so it answers for a capacity that
 * is shown without one just as well as for a select full of them.
 */
export function isEveryScheduleCapacityOptionFull(
  options: readonly Pick<ScheduleCapacitySelectOption, "isFull">[],
) {
  return options.length > 0 && options.every((option) => option.isFull);
}

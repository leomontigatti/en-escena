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
 * Occupancy is all it reads, so the locked capacity —which carries no label at
 * all— is answered by the same question as a full select.
 */
export function isEveryScheduleCapacityOptionFull<
  TOption extends Pick<ScheduleCapacitySelectOption, "isFull">,
>(options: readonly TOption[]) {
  return options.length > 0 && options.every((option) => option.isFull);
}

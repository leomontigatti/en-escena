/**
 * The sources of a choreography's schedule: the assigned capacity's schedule
 * (`schedule_capacity`) and its own schedule (`schedule_id`).
 */
export type ChoreographyScheduleSources = {
  choreographyScheduleId: string | null;
  scheduleCapacityScheduleId: string | null;
};

/**
 * The schedule that defines a choreography's price. It prefers the assigned
 * capacity's schedule; when the choreography uses the schedule's total capacity
 * there is no capacity row, and it falls back to its own `schedule_id`. Both
 * sources point at the same schedule, which the price rows depend on, so
 * resolving the price and quoting or collecting it have to use this same rule in
 * order not to diverge.
 */
export function resolveChoreographyPricingScheduleId(
  sources: ChoreographyScheduleSources,
): string | null {
  return sources.scheduleCapacityScheduleId ?? sources.choreographyScheduleId;
}

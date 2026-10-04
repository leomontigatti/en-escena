/**
 * What holds a schedule in place, as the detail page reads it: the special
 * prices that cover it and the choreographies that point at it, occupying or
 * withdrawn. The repository counts it with the same predicates its guards
 * refuse over, so the page locks and blocks exactly what the server would
 * refuse; the server still refuses, for the race.
 */
export type ScheduleDependencySummary = {
  coveringPriceNames: string[];
  occupyingChoreographyCount: number;
  withdrawnChoreographyCount: number;
};

/**
 * Why date and time cannot change: choreographies were placed and priced
 * against them. A withdrawn choreography holds no place, so it does not count.
 * Empty means they are editable.
 */
export function getScheduleDateTimeLockReasons(
  dependencies: ScheduleDependencySummary,
) {
  return [
    ...occupyingChoreographiesReason(dependencies.occupyingChoreographyCount),
    ...coveringPricesReason(dependencies.coveringPriceNames),
  ];
}

/**
 * Why the schedule cannot be deleted: everything that locks its date and time,
 * plus the withdrawn choreographies, whose reference to the schedule cannot be
 * released. Empty means it can be deleted.
 */
export function getScheduleDeleteBlockReasons(
  dependencies: ScheduleDependencySummary,
) {
  return [
    ...getScheduleDateTimeLockReasons(dependencies),
    ...withdrawnChoreographiesReason(dependencies.withdrawnChoreographyCount),
  ];
}

function occupyingChoreographiesReason(count: number) {
  if (count === 0) {
    return [];
  }

  return [
    count === 1
      ? "Tiene 1 coreografía asignada."
      : `Tiene ${count} coreografías asignadas.`,
  ];
}

function withdrawnChoreographiesReason(count: number) {
  if (count === 0) {
    return [];
  }

  return [
    count === 1
      ? "Tiene 1 coreografía retirada asignada."
      : `Tiene ${count} coreografías retiradas asignadas.`,
  ];
}

const priceNameList = new Intl.ListFormat("es", { type: "conjunction" });

function coveringPricesReason(names: string[]) {
  if (names.length === 0) {
    return [];
  }

  return [
    names.length === 1
      ? `Lo cubre el precio ${names[0]}.`
      : `Lo cubren los precios ${priceNameList.format(names)}.`,
  ];
}

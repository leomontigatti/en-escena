import {
  experienceLevelOrder,
  type ExperienceLevel,
} from "@/lib/events/experience-levels";
import { groupTypeValues, type GroupType } from "@/lib/events/group-types";

/**
 * The order of the event's presentations, derived from plain rows. Nothing here
 * reads the database or the clock, and nothing here reads money: what a
 * choreography owes neither gives nor takes a number. See
 * docs/domain/judging.md, "Participation And Judging".
 */

/**
 * `Separación de bailarines`: how many presentations two that share an active
 * dancer need between them, counted within one schedule. Fixed by the domain,
 * not an event setting.
 */
export const dancerSpacingGap = 4;

/** What puts a choreography in one block of the order, and nothing else. */
export type PresentationBlock = {
  category: { maxAge: number; minAge: number; name: string };
  /** `null` when the choreography declares no level; it sorts last. */
  experienceLevel: ExperienceLevel | null;
  groupType: GroupType;
  schedule: {
    id: string;
    name: string;
    scheduledDate: string;
    startTime: string;
  };
};

export type PresentationOrderingRow = PresentationBlock & {
  /** Withdrawn dancers are the caller's to leave out; the gap ignores them. */
  activeDancerIds: string[];
  choreographyId: string;
  choreographyNumber: number;
  /** `null` while the choreography has no presentation. */
  orderNumber: number | null;
  /**
   * `Coreografía retirada`: a numbered one keeps its number for good and an
   * unnumbered one is never given one.
   */
  withdrawn: boolean;
};

/** One number handed to one choreography; the frozen rows are not in it. */
export type PresentationPlacement = {
  choreographyId: string;
  orderNumber: number;
};

export type AutomaticOrderResult =
  | {
      ok: true;
      /** The frozen rows of the ordered days, left where they were. */
      frozenCount: number;
      /** The rows of the ordered days given a number. */
      orderedCount: number;
      /** Every number written, the shifted rows of the other days included. */
      placements: PresentationPlacement[];
    }
  | { ok: false; reason: "nothingToOrder" };

/**
 * `frozenRow`: the row itself is frozen. `frozenPosition`: the number typed or
 * dropped on is held by a frozen row, or sits inside a frozen run.
 * `withdrawnRow` and `withdrawnPosition`: the same for a withdrawn
 * presentation, which keeps its number however the rest move.
 */
export type ManualMoveResult =
  | {
      ok: true;
      movedToOrderNumber: number;
      placements: PresentationPlacement[];
    }
  | {
      ok: false;
      reason:
        "frozenPosition" | "frozenRow" | "withdrawnPosition" | "withdrawnRow";
    };

type FrozenRow = {
  choreographyId: string;
  orderNumber: number | null;
  schedule: { id: string };
  withdrawn: boolean;
};

/**
 * `Presentación fija`: every numbered row of a schedule that has at least one
 * evaluated presentation. A schedule that has started has been announced and
 * printed, so its whole lineup stays put — the unscored tail included — and
 * only the schedules that have not started are ordered again. The rule is
 * derived here from the evaluated ids; nothing stores it.
 */
export function findFrozenChoreographyIds(
  rows: FrozenRow[],
  evaluatedChoreographyIds: Set<string>,
): Set<string> {
  const frozenScheduleIds = new Set(
    rows
      .filter((row) => evaluatedChoreographyIds.has(row.choreographyId))
      .map((row) => row.schedule.id),
  );

  return new Set(
    rows
      .filter(
        (row) =>
          row.orderNumber !== null && frozenScheduleIds.has(row.schedule.id),
      )
      .map((row) => row.choreographyId),
  );
}

/**
 * The block order: schedule (date, time, name), then experience level from
 * `nudo` to `pro_am` and no level last, then category age order, then group
 * type. Modality plays no part — a schedule already restricts the modalities
 * it accepts.
 */
export function comparePresentationBlocks(
  left: PresentationBlock,
  right: PresentationBlock,
) {
  return (
    compare(left.schedule.scheduledDate, right.schedule.scheduledDate) ||
    compare(left.schedule.startTime, right.schedule.startTime) ||
    compare(left.schedule.name, right.schedule.name) ||
    compare(left.schedule.id, right.schedule.id) ||
    compare(
      experienceLevelRank(left.experienceLevel),
      experienceLevelRank(right.experienceLevel),
    ) ||
    compare(left.category.minAge, right.category.minAge) ||
    compare(left.category.maxAge, right.category.maxAge) ||
    compare(left.category.name, right.category.name) ||
    compare(
      groupTypeValues.indexOf(left.groupType),
      groupTypeValues.indexOf(right.groupType),
    )
  );
}

/**
 * The order of an event, keeping the frozen rows where they are. The input is
 * every choreography of the event, numbered or not; the output is a number for
 * every row that is not frozen. A frozen row keeps its
 * exact number, and the rest fill the free positions in ascending order —
 * every position not held by a frozen row and not inside a frozen run — so a
 * late row of a schedule that already ran lands right after that schedule
 * when the next position is free, and after the next frozen schedule when it
 * is not. Frozen numbers are never shifted to make room.
 *
 * A withdrawn presentation is held like a frozen one: its number is kept and
 * never handed to another row. A withdrawn choreography with no number is
 * left without one.
 *
 * `days` narrows the ordering to those days; none orders every day. A day left
 * out keeps its numbered rows in the order they have now, manual moves
 * included, and only shifts with the days before it; its late rows wait for
 * the day to be ordered. The numbers stay one sequence across the event, so a
 * day is laid out whole after the one before it.
 */
export function computeAutomaticOrder(
  rows: PresentationOrderingRow[],
  frozenChoreographyIds: Set<string> = new Set(),
  days: readonly string[] = [],
): AutomaticOrderResult {
  const isChosen = (row: PresentationOrderingRow) =>
    days.length === 0 || days.includes(row.schedule.scheduledDate);
  const frozen = rows.filter(
    (row) => frozenChoreographyIds.has(row.choreographyId) && !row.withdrawn,
  );
  const withdrawn = rows.filter(
    (row) => row.withdrawn && row.orderNumber !== null,
  );
  const unfrozen = rows.filter(
    (row) => !frozenChoreographyIds.has(row.choreographyId) && !row.withdrawn,
  );
  const chosen = unfrozen.filter(isChosen);

  if (chosen.length === 0) {
    return { ok: false, reason: "nothingToOrder" };
  }

  const kept = unfrozen.filter(
    (row) => !isChosen(row) && row.orderNumber !== null,
  );
  const byPosition = new Map<number, PresentationOrderingRow>(
    [...frozen, ...withdrawn].map((row) => [row.orderNumber!, row]),
  );
  const freePositions = listFreePositions(
    rows,
    frozenChoreographyIds,
    chosen.length + kept.length,
  );
  const placements: PresentationPlacement[] = [];
  let next = 0;
  const place = (chosenRow: PresentationOrderingRow, position: number) => {
    byPosition.set(position, chosenRow);
    placements.push({
      choreographyId: chosenRow.choreographyId,
      orderNumber: position,
    });
  };
  const placedDays = [
    ...new Set([...chosen, ...kept].map((row) => row.schedule.scheduledDate)),
  ].sort();

  for (const day of placedDays) {
    const keptOfDay = kept
      .filter((row) => row.schedule.scheduledDate === day)
      .sort((left, right) => left.orderNumber! - right.orderNumber!);

    for (const keptRow of keptOfDay) {
      place(keptRow, freePositions[next]);
      next += 1;
    }

    const chosenOfDay = chosen
      .filter((row) => row.schedule.scheduledDate === day)
      .sort(
        (left, right) =>
          comparePresentationBlocks(left, right) ||
          compare(left.choreographyNumber, right.choreographyNumber) ||
          compare(left.choreographyId, right.choreographyId),
      );

    for (const block of splitIntoBlocks(chosenOfDay)) {
      const remaining = [...block];

      while (remaining.length > 0) {
        const position = freePositions[next];
        next += 1;
        const index = remaining.findIndex(
          (candidate) =>
            !conflictsWithRecentPlacements(candidate, position, byPosition),
        );

        // Every remaining row clashes: the lowest number goes in and the clash
        // is left to `derivePresentationWarnings` to flag. The block sequence
        // is never broken to satisfy the gap.
        const [chosenRow] = remaining.splice(index === -1 ? 0 : index, 1);
        place(chosenRow, position);
      }
    }
  }

  return {
    ok: true,
    frozenCount: frozen.filter(isChosen).length,
    orderedCount: chosen.length,
    placements,
  };
}

/**
 * One row placed by hand among the free positions. `rows` are the numbered
 * rows of the event; `choreographyId` may be absent from them — a late
 * choreography being placed — which inserts it. The rows that are not frozen
 * are renumbered over the free positions, which also closes the gaps outside
 * the frozen runs; a frozen row never moves and its number is never a target.
 */
export function computeManualMove(
  rows: FrozenRow[],
  frozenChoreographyIds: Set<string>,
  choreographyId: string,
  toOrderNumber: number,
): ManualMoveResult {
  if (
    rows.some((row) => row.choreographyId === choreographyId && row.withdrawn)
  ) {
    return { ok: false, reason: "withdrawnRow" };
  }

  if (frozenChoreographyIds.has(choreographyId)) {
    return { ok: false, reason: "frozenRow" };
  }

  const numbered = rows.filter(
    (row): row is FrozenRow & { orderNumber: number } =>
      row.orderNumber !== null,
  );

  if (
    numbered.some((row) => row.withdrawn && row.orderNumber === toOrderNumber)
  ) {
    return { ok: false, reason: "withdrawnPosition" };
  }

  const unfrozenIds = numbered
    .filter(
      (row) => !frozenChoreographyIds.has(row.choreographyId) && !row.withdrawn,
    )
    .sort((left, right) => left.orderNumber - right.orderNumber)
    .map((row) => row.choreographyId);
  const isLate = !unfrozenIds.includes(choreographyId);
  // Checked against the blocked set itself, not against the free list: a
  // frozen number past the last free position is still not a target, and
  // must not be clamped to the end as if it were merely too high.
  if (
    listBlockedPositions(numbered, frozenChoreographyIds).has(toOrderNumber)
  ) {
    return { ok: false, reason: "frozenPosition" };
  }

  const freePositions = listFreePositions(
    numbered,
    frozenChoreographyIds,
    unfrozenIds.length + (isLate ? 1 : 0),
  );

  // The target index is where the number falls among the free positions; a
  // number past the last one is the end, as it always was.
  const toIndex = freePositions.filter(
    (position) => position < toOrderNumber,
  ).length;
  const orderedIds = movePosition(unfrozenIds, choreographyId, toIndex);
  const placements = orderedIds.map((id, index) => ({
    choreographyId: id,
    orderNumber: freePositions[index],
  }));

  return {
    ok: true,
    movedToOrderNumber: freePositions[orderedIds.indexOf(choreographyId)],
    placements,
  };
}

/**
 * Where a row lands when it is moved by hand. `id` may be absent from
 * `orderedIds` — a late choreography being placed — which inserts it.
 */
export function movePosition(
  orderedIds: string[],
  id: string,
  toIndex: number,
) {
  const without = orderedIds.filter((orderedId) => orderedId !== id);
  const target = Math.min(Math.max(toIndex, 0), without.length);

  return [...without.slice(0, target), id, ...without.slice(target)];
}

/**
 * The rows the gap is counted against: the `dancerSpacingGap` positions
 * before the one being filled, of which only those of the candidate's own
 * schedule count. A new schedule therefore starts the count over, while blocks
 * of one schedule carry it — and a frozen tail counts too, since the dancers
 * in it need the same rest whether the algorithm placed it or not. A withdrawn
 * presentation is skipped rather than counted: nobody dances in its slot, so
 * it is no rest, exactly as the `Separación` warning reads it.
 */
function conflictsWithRecentPlacements(
  row: PresentationOrderingRow,
  position: number,
  byPosition: Map<number, PresentationOrderingRow>,
) {
  const dancerIds = new Set(row.activeDancerIds);
  let counted = 0;

  for (
    let earlier = position - 1;
    earlier >= 1 && counted < dancerSpacingGap;
    earlier -= 1
  ) {
    const previous = byPosition.get(earlier);

    if (previous?.withdrawn) {
      continue;
    }

    counted += 1;

    if (
      previous &&
      previous.schedule.id === row.schedule.id &&
      previous.activeDancerIds.some((dancerId) => dancerIds.has(dancerId))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * The positions a row may not take: the number of a frozen or a withdrawn row,
 * and any gap between two consecutive numbered rows that are both frozen. Such
 * a gap is inside, or between, runs that already ran, and filling it would put
 * a stranger in the middle of what was announced. A gap beside a withdrawn row
 * of a schedule that has not run is an ordinary free position.
 */
function listBlockedPositions(
  rows: FrozenRow[],
  frozenChoreographyIds: Set<string>,
) {
  const numbered = rows
    .filter(
      (row): row is FrozenRow & { orderNumber: number } =>
        row.orderNumber !== null,
    )
    .sort((left, right) => left.orderNumber - right.orderNumber);
  const blocked = new Set<number>();

  for (let index = 0; index < numbered.length; index += 1) {
    const current = numbered[index];

    if (current.withdrawn) {
      blocked.add(current.orderNumber);
    }

    if (!frozenChoreographyIds.has(current.choreographyId)) {
      continue;
    }

    blocked.add(current.orderNumber);

    const previous = numbered[index - 1];

    if (previous && frozenChoreographyIds.has(previous.choreographyId)) {
      for (
        let gap = previous.orderNumber + 1;
        gap < current.orderNumber;
        gap += 1
      ) {
        blocked.add(gap);
      }
    }
  }

  return blocked;
}

/** The first `count` positions, from 1, that are not blocked. */
function listFreePositions(
  rows: FrozenRow[],
  frozenChoreographyIds: Set<string>,
  count: number,
) {
  const blocked = listBlockedPositions(rows, frozenChoreographyIds);
  const free: number[] = [];

  for (let position = 1; free.length < count; position += 1) {
    if (!blocked.has(position)) {
      free.push(position);
    }
  }

  return free;
}

function splitIntoBlocks(sorted: PresentationOrderingRow[]) {
  const blocks: PresentationOrderingRow[][] = [];

  for (const row of sorted) {
    const currentBlock = blocks.at(-1);

    if (currentBlock && comparePresentationBlocks(currentBlock[0], row) === 0) {
      currentBlock.push(row);
      continue;
    }

    blocks.push([row]);
  }

  return blocks;
}

/** No level ranks after every level, so it lands at the end of its schedule. */
function experienceLevelRank(experienceLevel: ExperienceLevel | null) {
  if (experienceLevel === null) {
    return experienceLevelOrder.length;
  }

  return experienceLevelOrder.indexOf(experienceLevel);
}

function compare(left: number | string, right: number | string) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

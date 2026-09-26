import {
  experienceLevelOrder,
  type ExperienceLevel,
} from "@/lib/events/experience-levels";
import { groupTypeValues, type GroupType } from "@/lib/events/group-types";
import type { ChoreographyFinancialStatus } from "@/lib/finances/inscription-financial-status";

/**
 * The order of the event's presentations, derived from plain rows. Nothing here
 * reads the database or the clock, and nothing here computes money: the caller
 * passes the choreography's financial status already derived. See
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
  financialStatus: ChoreographyFinancialStatus;
  /** `null` while the choreography has no presentation. */
  orderNumber: number | null;
};

/** One number handed to one choreography; the frozen rows are not in it. */
export type PresentationPlacement = {
  choreographyId: string;
  orderNumber: number;
};

export type AutomaticOrderResult =
  | { ok: true; frozenCount: number; placements: PresentationPlacement[] }
  | { ok: false; reason: "nothingToOrder" };

/**
 * `frozenRow`: the row itself is frozen. `frozenPosition`: the number typed or
 * dropped on is held by a frozen row, or sits inside a frozen run.
 */
export type ManualMoveResult =
  | {
      ok: true;
      movedToOrderNumber: number;
      placements: PresentationPlacement[];
    }
  | { ok: false; reason: "frozenPosition" | "frozenRow" };

type FrozenRow = {
  choreographyId: string;
  orderNumber: number | null;
  schedule: { id: string };
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
 * Whether a choreography can *get* a number: at least `Señada`. Keeping one has
 * no condition, so this never asks about a row that already has a presentation.
 */
export function isPresentationEligible(row: {
  financialStatus: ChoreographyFinancialStatus;
}) {
  return row.financialStatus !== "depositPending";
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
 * every choreography that has a presentation or is eligible for one; the
 * output is a number for every row that is not frozen. A frozen row keeps its
 * exact number, and the rest fill the free positions in ascending order —
 * every position not held by a frozen row and not inside a frozen run — so a
 * late row of a schedule that already ran lands right after that schedule
 * when the next position is free, and after the next frozen schedule when it
 * is not. Frozen numbers are never shifted to make room.
 */
export function computeAutomaticOrder(
  rows: PresentationOrderingRow[],
  frozenChoreographyIds: Set<string> = new Set(),
): AutomaticOrderResult {
  const candidates = rows.filter(
    (row) => row.orderNumber !== null || isPresentationEligible(row),
  );
  const frozen = candidates.filter((row) =>
    frozenChoreographyIds.has(row.choreographyId),
  );
  const unfrozen = candidates.filter(
    (row) => !frozenChoreographyIds.has(row.choreographyId),
  );

  if (unfrozen.length === 0) {
    return { ok: false, reason: "nothingToOrder" };
  }

  const sorted = [...unfrozen].sort(
    (left, right) =>
      comparePresentationBlocks(left, right) ||
      compare(left.choreographyNumber, right.choreographyNumber) ||
      compare(left.choreographyId, right.choreographyId),
  );

  const byPosition = new Map<number, PresentationOrderingRow>(
    frozen.map((row) => [row.orderNumber!, row]),
  );
  const freePositions = listFreePositions(
    candidates,
    frozenChoreographyIds,
    unfrozen.length,
  );
  const placements: PresentationPlacement[] = [];
  let next = 0;

  for (const block of splitIntoBlocks(sorted)) {
    const remaining = [...block];

    while (remaining.length > 0) {
      const position = freePositions[next];
      next += 1;
      const index = remaining.findIndex(
        (row) => !conflictsWithRecentPlacements(row, position, byPosition),
      );

      // Every remaining row clashes: the lowest number goes in and the clash is
      // left to `derivePresentationWarnings` to flag. The block sequence is
      // never broken to satisfy the gap.
      const [chosen] = remaining.splice(index === -1 ? 0 : index, 1);
      byPosition.set(position, chosen);
      placements.push({
        choreographyId: chosen.choreographyId,
        orderNumber: position,
      });
    }
  }

  return { ok: true, frozenCount: frozen.length, placements };
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
  if (frozenChoreographyIds.has(choreographyId)) {
    return { ok: false, reason: "frozenRow" };
  }

  const numbered = rows.filter(
    (row): row is FrozenRow & { orderNumber: number } =>
      row.orderNumber !== null,
  );
  const unfrozenIds = numbered
    .filter((row) => !frozenChoreographyIds.has(row.choreographyId))
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
 * in it need the same rest whether the algorithm placed it or not.
 */
function conflictsWithRecentPlacements(
  row: PresentationOrderingRow,
  position: number,
  byPosition: Map<number, PresentationOrderingRow>,
) {
  const dancerIds = new Set(row.activeDancerIds);

  for (let offset = 1; offset <= dancerSpacingGap; offset += 1) {
    const previous = byPosition.get(position - offset);

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
 * The positions a row may not take: the number of a frozen row, and any gap
 * between two consecutive numbered rows that are both frozen. Such a gap is
 * inside, or between, runs that already ran, and filling it would put a
 * stranger in the middle of what was announced.
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

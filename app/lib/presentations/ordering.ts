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

export type AutomaticOrderResult =
  | { ok: true; choreographyIds: string[] }
  | { ok: false; reason: "nothingToOrder" };

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
 * The whole order of an event, from scratch. The input is every choreography
 * that has a presentation or is eligible for one; the output is the order the
 * numbers are handed out in, from 1.
 */
export function computeAutomaticOrder(
  rows: PresentationOrderingRow[],
): AutomaticOrderResult {
  const candidates = rows.filter(
    (row) => row.orderNumber !== null || isPresentationEligible(row),
  );

  if (candidates.length === 0) {
    return { ok: false, reason: "nothingToOrder" };
  }

  const sorted = [...candidates].sort(
    (left, right) =>
      comparePresentationBlocks(left, right) ||
      compare(left.choreographyNumber, right.choreographyNumber) ||
      compare(left.choreographyId, right.choreographyId),
  );

  const placed: PresentationOrderingRow[] = [];

  for (const block of splitIntoBlocks(sorted)) {
    const remaining = [...block];

    while (remaining.length > 0) {
      const index = remaining.findIndex(
        (row) => !conflictsWithRecentPlacements(row, placed),
      );

      // Every remaining row clashes: the lowest number goes in and the clash is
      // left to `derivePresentationWarnings` to flag. The block sequence is
      // never broken to satisfy the gap.
      const [chosen] = remaining.splice(index === -1 ? 0 : index, 1);
      placed.push(chosen);
    }
  }

  return { ok: true, choreographyIds: placed.map((row) => row.choreographyId) };
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
 * The rows the gap is counted against: the last `dancerSpacingGap` placements,
 * of which only those of the candidate's own schedule count. A new schedule
 * therefore starts the count over, while blocks of one schedule carry it.
 */
function conflictsWithRecentPlacements(
  row: PresentationOrderingRow,
  placed: PresentationOrderingRow[],
) {
  const dancerIds = new Set(row.activeDancerIds);

  return placed
    .slice(-dancerSpacingGap)
    .filter((previous) => previous.schedule.id === row.schedule.id)
    .some((previous) =>
      previous.activeDancerIds.some((dancerId) => dancerIds.has(dancerId)),
    );
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

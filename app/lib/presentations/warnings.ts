import type { ExperienceLevel } from "@/lib/events/experience-levels";
import type { ChoreographyFinancialStatus } from "@/lib/finances/inscription-financial-status";

import {
  comparePresentationBlocks,
  dancerSpacingGap,
  type PresentationBlock,
} from "./ordering";

/**
 * `Advertencia`: derived on read, stored nowhere, blocking nothing — not the
 * ordering, not a judge assignment, not publishing the program. See
 * docs/domain/judging.md, "Participation And Judging".
 */

export type PresentationWarningKind =
  | "belowDeposit"
  | "dancerSpacing"
  | "evaluatedSchedule"
  | "missingJudges"
  | "missingLevel"
  | "outOfBlock";

export type PresentationWarning = {
  kind: PresentationWarningKind;
  message: string;
};

export type PresentationWarningRow = PresentationBlock & {
  activeDancers: { id: string; name: string }[];
  /** The levels the row's category admits; empty when it admits none. */
  category: { experienceLevels: ExperienceLevel[] };
  choreographyId: string;
  choreographyNumber: number;
  financialStatus: ChoreographyFinancialStatus;
  /** `null` while the choreography has no presentation. */
  orderNumber: number | null;
};

/**
 * Which kind outranks which wherever the warnings of one row are shown, most
 * relevant first. The same order drives the row's badge.
 */
const warningKindPrecedence: readonly PresentationWarningKind[] = [
  "missingJudges",
  "belowDeposit",
  "evaluatedSchedule",
  "dancerSpacing",
  "outOfBlock",
  "missingLevel",
];

/**
 * What the rows alone do not say, each set naming choreographies.
 *
 * `frozenChoreographyIds` is what `findFrozenChoreographyIds` answers: it
 * names the schedules that already ran, and an unnumbered row of one of them is
 * flagged, since no ordering can put it among the presentations that were
 * announced.
 *
 * `assignedChoreographyIds` are the presentations with at least one judge
 * assigned. A numbered one without any is flagged only when another of its
 * schedule has a judge: judges are assigned a schedule at a time, so a
 * schedule nobody has assigned yet is work not started, while one gap among
 * assigned presentations is the one left behind — typically numbered after
 * the panel was assigned. A disqualified presentation is left out: it needs
 * no panel.
 */
export type PresentationWarningContext = {
  assignedChoreographyIds?: Set<string>;
  disqualifiedChoreographyIds?: Set<string>;
  frozenChoreographyIds?: Set<string>;
};

/**
 * Every warning of every row, keyed by choreography; rows with none are
 * absent.
 */
export function derivePresentationWarnings(
  rows: PresentationWarningRow[],
  {
    assignedChoreographyIds = new Set(),
    disqualifiedChoreographyIds = new Set(),
    frozenChoreographyIds = new Set(),
  }: PresentationWarningContext = {},
) {
  const frozenScheduleIds = scheduleIdsOf(rows, frozenChoreographyIds);
  const assignedScheduleIds = scheduleIdsOf(rows, assignedChoreographyIds);
  const warnings = new Map<string, PresentationWarning[]>();

  const add = (choreographyId: string, warning: PresentationWarning) => {
    const current = warnings.get(choreographyId) ?? [];
    current.push(warning);
    warnings.set(choreographyId, current);
  };

  const ordered = rows
    .filter((row) => row.orderNumber !== null)
    .sort(
      (left, right) =>
        left.orderNumber! - right.orderNumber! ||
        compareText(left.choreographyId, right.choreographyId),
    );

  // The per-row kinds.
  for (const row of rows) {
    if (
      row.orderNumber !== null &&
      assignedScheduleIds.has(row.schedule.id) &&
      !assignedChoreographyIds.has(row.choreographyId) &&
      !disqualifiedChoreographyIds.has(row.choreographyId)
    ) {
      add(row.choreographyId, {
        kind: "missingJudges",
        message:
          "Sin jueces: otras presentaciones de su cronograma ya los tienen",
      });
    }

    if (row.financialStatus === "depositPending") {
      add(row.choreographyId, {
        kind: "belowDeposit",
        message: "Seña pendiente",
      });
    }

    // A category that admits levels and a row without one: the ordering sorts
    // it last and only the administrator can repair it.
    if (
      row.category.experienceLevels.length > 0 &&
      row.experienceLevel === null
    ) {
      add(row.choreographyId, { kind: "missingLevel", message: "Sin nivel" });
    }

    if (row.orderNumber === null && frozenScheduleIds.has(row.schedule.id)) {
      add(row.choreographyId, {
        kind: "evaluatedSchedule",
        message:
          "Su cronograma ya fue evaluado: se ubicará después de los cronogramas ya evaluados",
      });
    }
  }

  for (const clash of findSpacingClashes(ordered)) {
    add(clash.choreographyId, {
      kind: "dancerSpacing",
      message: `Separación insuficiente: comparte a ${clash.dancerName} con la n.º ${clash.otherOrderNumber}`,
    });
  }

  for (const choreographyId of findOutOfBlock(ordered)) {
    add(choreographyId, { kind: "outOfBlock", message: "Fuera de su bloque" });
  }

  for (const [choreographyId, rowWarnings] of warnings) {
    warnings.set(choreographyId, sortByPrecedence(rowWarnings));
  }

  return warnings;
}

/**
 * Both rows of every clash, one entry per shared dancer: two presentations of
 * one schedule with fewer than `dancerSpacingGap` others between them.
 */
function findSpacingClashes(ordered: PresentationWarningRow[]) {
  const clashes: {
    choreographyId: string;
    dancerName: string;
    otherOrderNumber: number;
  }[] = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const row = ordered[index];
    const window = ordered.slice(index + 1, index + 1 + dancerSpacingGap);

    for (const other of window) {
      if (other.schedule.id !== row.schedule.id) {
        continue;
      }

      const shared = row.activeDancers
        .filter((dancer) =>
          other.activeDancers.some((candidate) => candidate.id === dancer.id),
        )
        .sort(
          (left, right) =>
            compareText(left.name, right.name) ||
            compareText(left.id, right.id),
        );

      for (const dancer of shared) {
        clashes.push({
          choreographyId: row.choreographyId,
          dancerName: dancer.name,
          otherOrderNumber: other.orderNumber!,
        });
        clashes.push({
          choreographyId: other.choreographyId,
          dancerName: dancer.name,
          otherOrderNumber: row.orderNumber!,
        });
      }
    }
  }

  return clashes;
}

/**
 * The smallest set of presentations whose removal leaves the rest in block
 * order — the complement of a longest non-decreasing run over the block rank.
 * Among the runs of that length it keeps the one with the lowest choreography
 * numbers, so a tie flags the higher number.
 */
function findOutOfBlock(ordered: PresentationWarningRow[]) {
  if (ordered.length === 0) {
    return [];
  }

  const ranks = rankBlocks(ordered);
  const best = ordered.map((row, index) => ({
    keptNumbersTotal: row.choreographyNumber,
    length: 1,
    previousIndex: -1,
    index,
  }));

  for (let index = 0; index < ordered.length; index += 1) {
    for (let previous = 0; previous < index; previous += 1) {
      if (ranks[previous] > ranks[index]) {
        continue;
      }

      const candidate = {
        keptNumbersTotal:
          best[previous].keptNumbersTotal + ordered[index].choreographyNumber,
        length: best[previous].length + 1,
        previousIndex: previous,
        index,
      };

      if (isBetterRun(candidate, best[index])) {
        best[index] = candidate;
      }
    }
  }

  const end = best.reduce(
    (left, right) => (isBetterRun(right, left) ? right : left),
    best[0],
  );
  const kept = new Set<string>();

  for (let cursor = end; cursor; cursor = best[cursor.previousIndex]) {
    kept.add(ordered[cursor.index].choreographyId);

    if (cursor.previousIndex === -1) {
      break;
    }
  }

  return ordered
    .filter((row) => !kept.has(row.choreographyId))
    .map((row) => row.choreographyId);
}

type BlockRun = {
  keptNumbersTotal: number;
  length: number;
  previousIndex: number;
  index: number;
};

function isBetterRun(candidate: BlockRun, current: BlockRun | undefined) {
  if (!current) {
    return true;
  }

  if (candidate.length !== current.length) {
    return candidate.length > current.length;
  }

  if (candidate.keptNumbersTotal !== current.keptNumbersTotal) {
    return candidate.keptNumbersTotal < current.keptNumbersTotal;
  }

  return candidate.index < current.index;
}

/** Each row's block, as a position in the block order the ordering defines. */
function rankBlocks(ordered: PresentationWarningRow[]) {
  const blocks = [...ordered].sort(comparePresentationBlocks);
  const ranks: number[] = [];

  for (const row of ordered) {
    ranks.push(
      blocks.findIndex((block) => comparePresentationBlocks(block, row) === 0),
    );
  }

  return ranks;
}

/** The schedules of the rows `choreographyIds` names. */
function scheduleIdsOf(
  rows: PresentationWarningRow[],
  choreographyIds: Set<string>,
) {
  return new Set(
    rows
      .filter((row) => choreographyIds.has(row.choreographyId))
      .map((row) => row.schedule.id),
  );
}

function sortByPrecedence(rowWarnings: PresentationWarning[]) {
  return [...rowWarnings].sort(
    (left, right) =>
      warningKindPrecedence.indexOf(left.kind) -
      warningKindPrecedence.indexOf(right.kind),
  );
}

function compareText(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

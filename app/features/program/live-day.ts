import { judgingDate } from "@/lib/judging/judging-day";
import {
  getBusinessDateOnly,
  getBusinessTimeOnly,
} from "@/lib/shared/business-time-zone";

/**
 * The public program's day that is being danced: the judging day, so it runs
 * past midnight and closes at 03:00 like the judges' window. The page marks
 * its evaluated rows for the whole day, and calls it `En vivo` from its first
 * schedule's start until its last presentation is evaluated — or 03:00, when
 * that one is never scored. It is per day and not per schedule, so the badge
 * stays on through the breaks between blocks and their award ceremonies.
 *
 * Evaluated is the fact `evaluation-lock.server.ts` locks on: any score, or a
 * disqualification. The program reads it as `Ya se presentó` and never says
 * which of the two it was.
 */
export type ProgramLiveDay = {
  date: string;
  /**
   * The day's last presentation, by order, is evaluated. A withdrawn one is
   * never danced, so the last one still taking part is the one that counts.
   */
  isOver: boolean;
  evaluatedChoreographyIds: string[];
  /** `HH:MM`, the start of the day's first schedule. */
  startTime: string;
};

/**
 * What the loader knows of the live day, and the judging day it knew it on:
 * a page still open when the next judging day begins sees the two differ, and
 * asks for the new day's data.
 */
export type ProgramLive = {
  day: ProgramLiveDay | null;
  /**
   * The instant the loader read it, ISO. The first render reads the clock
   * from here, so the server and the browser render the same opening tab and
   * badge, whatever the browser's clock says.
   */
  loadedAt: string;
  loadedOn: string;
};

export function readProgramLiveDay({
  now,
  evaluatedChoreographyIds,
  rows,
  schedules,
}: {
  now: Date;
  evaluatedChoreographyIds: ReadonlySet<string>;
  rows: ReadonlyArray<{
    choreographyId: string;
    orderNumber: number | null;
    scheduledDate: string;
    withdrawn: boolean;
  }>;
  schedules: ReadonlyArray<{ scheduledDate: string; startTime: string }>;
}): ProgramLiveDay | null {
  const date = judgingDate(now);
  const dayRows = rows.filter((row) => row.scheduledDate === date);
  const startTime = schedules
    .filter((schedule) => schedule.scheduledDate === date)
    .map((schedule) => schedule.startTime)
    .sort()[0];

  if (dayRows.length === 0 || startTime === undefined) {
    return null;
  }

  const performingRows = dayRows.filter((row) => !row.withdrawn);
  const lastRow = performingRows.reduce<(typeof performingRows)[number] | null>(
    (last, row) =>
      last === null || (row.orderNumber ?? 0) > (last.orderNumber ?? 0)
        ? row
        : last,
    null,
  );

  return {
    date,
    // A day of withdrawn presentations only has nothing left to dance.
    isOver:
      lastRow === null || evaluatedChoreographyIds.has(lastRow.choreographyId),
    evaluatedChoreographyIds: dayRows
      .map((row) => row.choreographyId)
      .filter((id) => evaluatedChoreographyIds.has(id)),
    startTime,
  };
}

export function showsEvaluatedMarks(day: ProgramLiveDay, now: Date) {
  return judgingDate(now) === day.date;
}

export function isProgramDayLive(day: ProgramLiveDay, now: Date) {
  if (day.isOver || !showsEvaluatedMarks(day, now)) {
    return false;
  }

  // Past midnight the business date is already the next one, and the show
  // has started long before.
  return (
    getBusinessDateOnly(now) > day.date ||
    getBusinessTimeOnly(now) >= day.startTime
  );
}

/**
 * The page of the day's list, in order, that holds its last evaluated
 * presentation: where the show is. Page one while none is evaluated.
 */
export function lastEvaluatedPage({
  day,
  pageSize,
  rows,
}: {
  day: ProgramLiveDay;
  pageSize: number;
  rows: ReadonlyArray<{
    choreographyId: string;
    orderNumber: number | null;
    scheduledDate: string;
  }>;
}) {
  const evaluated = new Set(day.evaluatedChoreographyIds);
  const dayOrderNumbers = rows
    .filter((row) => row.scheduledDate === day.date)
    .flatMap((row) => (row.orderNumber === null ? [] : [row.orderNumber]));
  const lastEvaluated = Math.max(
    0,
    ...rows
      .filter((row) => evaluated.has(row.choreographyId))
      .flatMap((row) => (row.orderNumber === null ? [] : [row.orderNumber])),
  );
  const position = dayOrderNumbers.filter(
    (orderNumber) => orderNumber <= lastEvaluated,
  ).length;

  return Math.max(1, Math.ceil(position / pageSize));
}

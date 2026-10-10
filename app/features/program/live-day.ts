import { judgingDate } from "@/lib/judging/judging-day";
import {
  getBusinessDateOnly,
  getBusinessTimeOnly,
} from "@/lib/shared/business-time-zone";

/**
 * The public program's day that is being danced: the judging day, so it runs
 * past midnight and closes at 03:00 like the judges' window. The page marks
 * its presented rows for the whole day, and calls it `En vivo` from its first
 * schedule's start until its last presentation is presented — or 03:00, when
 * that one is never scored. It is per day and not per schedule, so the badge
 * stays on through the breaks between blocks and their award ceremonies.
 *
 * `presented` is the fact `evaluation-status.server.ts` calls evaluated: any
 * score, or a disqualification. The program says it happened, never why.
 */
export type ProgramLiveDay = {
  date: string;
  /** The day's last presentation, by order, is presented. */
  isOver: boolean;
  presentedChoreographyIds: string[];
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
  loadedOn: string;
};

export function readProgramLiveDay({
  now,
  presentedChoreographyIds,
  rows,
  schedules,
}: {
  now: Date;
  presentedChoreographyIds: ReadonlySet<string>;
  rows: ReadonlyArray<{
    choreographyId: string;
    orderNumber: number | null;
    scheduledDate: string;
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

  const lastRow = dayRows.reduce((last, row) =>
    (row.orderNumber ?? 0) > (last.orderNumber ?? 0) ? row : last,
  );

  return {
    date,
    isOver: presentedChoreographyIds.has(lastRow.choreographyId),
    presentedChoreographyIds: dayRows
      .map((row) => row.choreographyId)
      .filter((id) => presentedChoreographyIds.has(id)),
    startTime,
  };
}

export function showsPresentedMarks(day: ProgramLiveDay, now: Date) {
  return judgingDate(now) === day.date;
}

export function isProgramDayLive(day: ProgramLiveDay, now: Date) {
  if (day.isOver || !showsPresentedMarks(day, now)) {
    return false;
  }

  // Past midnight the business date is already the next one, and the show
  // has started long before.
  return (
    getBusinessDateOnly(now) > day.date ||
    getBusinessTimeOnly(now) >= day.startTime
  );
}

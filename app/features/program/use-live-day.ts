import { useEffect, useRef, useState } from "react";

import { judgingDate } from "@/lib/judging/judging-day";

import { allDaysTabValue, useScheduleDayTab } from "./day-tabs";
import {
  isProgramDayLive,
  showsEvaluatedMarks,
  type ProgramLive,
} from "./live-day";

const minuteMs = 60_000;

/**
 * The program's day tab, and what it shows of the day being danced as the
 * clock moves: the `En vivo` badge, and the rows marked evaluated on the
 * chosen tab. A page opened while the badge is on opens on its day, the one
 * tab that carries the marks and polls, and stays on the tab it was read on
 * when the badge goes off. The clock
 * is read once a minute, so the badge turns on at the start time without a
 * reload. The same tick asks for fresh data, which is the only thing that
 * moves the marks — React does not fetch on its own — while the badge is on
 * and its tab is chosen, and once when a new program day begins, whose rows
 * only the loader knows.
 */
export function useProgramLiveDay({
  days,
  live,
  onPoll,
}: {
  days: readonly string[];
  live: ProgramLive | null;
  onPoll?: () => void;
}) {
  // The first render reads the loader's clock, as the server did, and the
  // browser's own takes over once hydrated.
  const [now, setNow] = useState(() =>
    live ? new Date(live.loadedAt) : new Date(),
  );
  const [openingDay] = useState(() =>
    live?.day && isProgramDayLive(live.day, now)
      ? live.day.date
      : allDaysTabValue,
  );
  const tab = useScheduleDayTab(days, openingDay);
  const selectedDay = tab.value;
  // Both are rebuilt on every render; reading them through refs keeps a
  // keystroke in the search from restarting the minute.
  const onPollRef = useRef(onPoll);
  const daysRef = useRef(days);

  useEffect(() => {
    onPollRef.current = onPoll;
    daysRef.current = days;
  });

  useEffect(() => {
    setNow(new Date());
  }, []);

  useEffect(() => {
    if (!live) {
      return;
    }

    const interval = setInterval(() => {
      const tick = new Date();
      const today = judgingDate(tick);
      const isNewProgramDay =
        today !== live.loadedOn && daysRef.current.includes(today);
      const isWatchingLiveDay =
        live.day !== null &&
        selectedDay === live.day.date &&
        isProgramDayLive(live.day, tick);

      setNow(tick);

      if (isNewProgramDay || isWatchingLiveDay) {
        onPollRef.current?.();
      }
    }, minuteMs);

    return () => clearInterval(interval);
  }, [live, selectedDay]);

  const day = live?.day ?? null;

  if (!day) {
    return { liveBadgeDay: null, evaluatedChoreographyIds: noIds, tab };
  }

  return {
    liveBadgeDay: isProgramDayLive(day, now) ? day.date : null,
    evaluatedChoreographyIds:
      selectedDay === day.date && showsEvaluatedMarks(day, now)
        ? new Set(day.evaluatedChoreographyIds)
        : noIds,
    tab,
  };
}

const noIds: ReadonlySet<string> = new Set();

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { judgingDate } from "@/lib/judging/judging-day";
import {
  listQueryParamNames,
  withoutListQuery,
} from "@/lib/list-query/list-query";
import { dayTabParam } from "@/lib/shared/url-tab";

import { useScheduleDayTab } from "./day-tabs";
import {
  isProgramDayLive,
  lastEvaluatedPage,
  showsEvaluatedMarks,
  type ProgramLive,
} from "./live-day";

const minuteMs = 60_000;

/**
 * The program's day tab, and what it shows of the day being danced as the
 * clock moves: the `En vivo` badge, and the rows marked evaluated on the
 * chosen tab. A page opened while the badge is on opens on its day, the one
 * tab that carries the marks and polls, at the page of its last evaluated
 * presentation, and stays on the tab it was read on when the badge goes off.
 * The clock
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
  pageSize,
  rows,
}: {
  days: readonly string[];
  live: ProgramLive | null;
  onPoll?: () => void;
  /** The list's, to find the page the show is on. */
  pageSize: number;
  rows: Parameters<typeof lastEvaluatedPage>[0]["rows"];
}) {
  // The first render reads the loader's clock, as the server did, and the
  // browser's own takes over once hydrated.
  const [now, setNow] = useState(() =>
    live ? new Date(live.loadedAt) : new Date(),
  );
  // Not live, the program opens on its first day, as every list of the order.
  const [openingDay] = useState(() =>
    live?.day && isProgramDayLive(live.day, now) ? live.day.date : undefined,
  );
  const tab = useScheduleDayTab(days, openingDay);
  const selectedDay = tab.value;
  useOpenAtShowPage({ live, openingDay, pageSize, rows });
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

/**
 * Once, on the URL the page was loaded with: a page that opened on the live
 * day goes to the page of its last evaluated presentation. A link naming a
 * day, a page or a search is left where it points. The page is named with its
 * day, so a reload after the show still lands on it.
 */
function useOpenAtShowPage({
  live,
  openingDay,
  pageSize,
  rows,
}: {
  live: ProgramLive | null;
  openingDay: string | undefined;
  pageSize: number;
  rows: Parameters<typeof lastEvaluatedPage>[0]["rows"];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const hasOpened = useRef(false);

  useEffect(() => {
    if (hasOpened.current) {
      return;
    }

    hasOpened.current = true;

    if (
      !live?.day ||
      openingDay !== live.day.date ||
      searchParams.has(dayTabParam) ||
      withoutListQuery(searchParams.toString()) !== null
    ) {
      return;
    }

    const page = lastEvaluatedPage({ day: live.day, pageSize, rows });

    if (page > 1) {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);

          next.set(dayTabParam, openingDay);
          next.set(listQueryParamNames.page, String(page));

          return next;
        },
        { preventScrollReset: true, replace: true },
      );
    }
  }, [live, openingDay, pageSize, rows, searchParams, setSearchParams]);
}

const noIds: ReadonlySet<string> = new Set();

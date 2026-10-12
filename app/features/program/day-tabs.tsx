import type { ReactNode } from "react";

import { ListTabs } from "@/components/shared/list-tabs";
import { Badge } from "@/components/ui/badge";
import { formatScheduleDayTabLabel } from "@/lib/choreographies/schedule-formatters";
import { listQueryParamNames } from "@/lib/list-query/list-query";
import { dayTabParam, useUrlTab } from "@/lib/shared/url-tab";

/**
 * The day tabs every list of the order opens with — the administration's, the
 * academy's and the public program — written once so the three stay one
 * design.
 */

/**
 * The chosen day, kept in the URL. Another day is another list, so the page
 * read on the day being left is dropped with it. There is no tab for every
 * day: the page opens on the first unless it names another tab, the public
 * program's day being danced.
 */
export function useScheduleDayTab(
  days: readonly string[],
  openingValue?: string,
) {
  // A list with no day has no rows either, and so no tab to choose.
  const firstDay = days[0] ?? "";

  return useUrlTab({
    defaultValue: firstDay,
    openingValue: openingValue ?? firstDay,
    param: dayTabParam,
    resets: [listQueryParamNames.page],
    values: days,
  });
}

export function ScheduleDayTabs({
  children,
  days,
  liveDay = null,
  tab,
}: {
  /** The list the chosen day narrows. */
  children: ReactNode;
  days: readonly string[];
  /** The day the public program calls `En vivo`, which its tab announces. */
  liveDay?: string | null;
  tab: ReturnType<typeof useScheduleDayTab>;
}) {
  return (
    <ListTabs
      onValueChange={tab.onValueChange}
      tabs={days.map((day) => ({
        label: (
          <>
            {formatScheduleDayTabLabel(day)}
            {day === liveDay ? <LiveBadge /> : null}
          </>
        ),
        value: day,
      }))}
      value={tab.value}
    >
      {children}
    </ListTabs>
  );
}

/**
 * Red and pulsing like a broadcast's, so it reads from a tab that is not
 * chosen: a reader on another day is sent back to the day being danced.
 * `destructive` is borrowed for its red, not for a negative state — a design
 * decision of #1421, not the style guide's rule.
 */
function LiveBadge() {
  return (
    <Badge variant="destructive">
      <span aria-hidden="true" className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75 motion-reduce:animate-none" />
        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
      </span>
      En vivo
    </Badge>
  );
}

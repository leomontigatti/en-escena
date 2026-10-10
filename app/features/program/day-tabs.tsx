import { LiveBadge } from "./presented-mark.prototype";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatScheduleDayTabLabel } from "@/lib/choreographies/schedule-formatters";
import { listQueryParamNames } from "@/lib/list-query/list-query";
import { dayTabParam, useUrlTab } from "@/lib/shared/url-tab";

/**
 * The day tabs every list of the order opens with — the administration's, the
 * academy's and the public program — written once so the three stay one
 * design.
 */

export const allDaysTabValue = "todos";

/**
 * The chosen day, kept in the URL. Another day is another list, so the page
 * read on the day being left is dropped with it.
 */
export function useScheduleDayTab(days: readonly string[]) {
  return useUrlTab({
    defaultValue: allDaysTabValue,
    param: dayTabParam,
    resets: [listQueryParamNames.page],
    values: [allDaysTabValue, ...days],
  });
}

export function ScheduleDayTabs({
  days,
  liveDay,
  tab,
}: {
  days: readonly string[];
  liveDay?: string;
  tab: ReturnType<typeof useScheduleDayTab>;
}) {
  return (
    <Tabs
      value={tab.value}
      onValueChange={tab.onValueChange}
      // An event with more days than the page is wide scrolls its tabs rather
      // than widening the page; the padding keeps the active underline, drawn
      // below the list, inside the scroll box that would otherwise clip it.
      className="max-w-full overflow-x-auto pb-1"
    >
      <TabsList variant="line">
        <TabsTrigger value={allDaysTabValue}>Todos</TabsTrigger>
        {days.map((day) => (
          <TabsTrigger key={day} value={day}>
            {formatScheduleDayTabLabel(day)}
            {day === liveDay ? <LiveBadge /> : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

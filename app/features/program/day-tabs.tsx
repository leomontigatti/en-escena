import { Badge } from "@/components/ui/badge";
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
  liveDay = null,
  tab,
}: {
  days: readonly string[];
  /** The day the public program calls `En vivo`, which its tab announces. */
  liveDay?: string | null;
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

/**
 * Red and pulsing like a broadcast's, so it reads from a tab that is not
 * chosen: the page opens on `Todos`, and the badge is what sends the audience
 * to the day being danced. `destructive` is borrowed for its red, not for a
 * negative state — a design decision of #1421, not the style guide's rule.
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

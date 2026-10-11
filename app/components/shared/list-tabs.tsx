import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ListTab = {
  label: ReactNode;
  value: string;
};

/**
 * Tabs above a list, and the list under them: the one place that spaces the
 * two, 16px from the tab row to the list's search on every tabbed list (#1407).
 * The page shows the active tab's list as `children` and owns no spacing of
 * its own.
 */
export function ListTabs({
  children,
  onValueChange,
  tabs,
  value,
}: {
  /** The active tab's list: its search, its table. */
  children: ReactNode;
  onValueChange: (value: string) => void;
  tabs: readonly ListTab[];
  value: string;
}) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className="gap-3">
      {/* More tabs than the page is wide scroll rather than widen the page.
          The padding keeps the active underline, drawn below the row, inside
          the scroll box that would otherwise clip it, and with the gap makes
          the 16px. */}
      <div className="max-w-full overflow-x-auto pb-1">
        <TabsList variant="line">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {/* The list sets its own text size, and opens on its search, so the
          panel is neither a type scale nor a tab stop of its own. */}
      <TabsContent
        className="text-[length:inherit]"
        tabIndex={-1}
        value={value}
      >
        {children}
      </TabsContent>
    </Tabs>
  );
}

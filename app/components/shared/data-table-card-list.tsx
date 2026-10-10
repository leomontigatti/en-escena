import type { ReactNode } from "react";
import type { Table as TanStackTable } from "@tanstack/react-table";

import { Card, CardContent } from "@/components/ui/card";

/**
 * A list's rows as compact cards, which is how a portal list reads on a phone:
 * the table's columns do not fit there, and dropping some loses what the row
 * competed in or owes. It draws the rows the table would — searched, filtered,
 * sorted and paged — so the toolbar and the footer around it stay the
 * table's own. The view writes what goes inside a card; the frame is here, so
 * every list's cards are one design. There is no header here, so no sort
 * control, no selection and no reordering: the cards keep the table's order.
 */
export function DataTableCardList<TData>({
  emptyMessage,
  renderCard,
  table,
}: {
  emptyMessage: string;
  renderCard: (row: TData) => ReactNode;
  table: TanStackTable<TData>;
}) {
  const rows = table.getRowModel().rows;

  if (rows.length === 0) {
    return (
      <p className="flex h-24 items-center justify-center rounded-lg border bg-background px-4 text-center text-sm text-muted-foreground sm:hidden">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2 sm:hidden">
      {rows.map((row) => (
        <li key={row.id}>
          <Card size="sm">
            <CardContent className="flex flex-col gap-2">
              {renderCard(row.original)}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

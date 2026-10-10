import type { ReactNode } from "react";

import { DataTableTruncatedText } from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import { formatProgramOrderNumber, type ProgramListRow } from "./shared";

/**
 * A row of the order as a card on a phone, for every list built on
 * `ProgramListRow`: the name and its number, then what the row is in one muted
 * line. What comes last is each list's own — the result's award and average,
 * or who dances.
 */
export function ProgramRowCard({
  children,
  row,
  showLevel,
  to,
}: {
  children?: ReactNode;
  row: ProgramListRow;
  /** As the list's `Nivel` column: only where the table carries it. */
  showLevel: boolean;
  to: string | null;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 font-medium">
          <ProgramRowName row={row} to={to} />
        </div>
        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
          N.º {formatProgramOrderNumber(row) || "—"}
        </span>
      </div>
      <DataTableTruncatedText
        className="text-xs text-muted-foreground"
        value={[
          formatPrimaryAndSecondaryValue(row.modalityName, row.submodalityName),
          formatPrimaryAndSecondaryValue(
            row.categoryName,
            formatGroupTypeLabel(row.groupType),
          ),
          showLevel ? row.levelLabel : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      {children}
    </>
  );
}

/**
 * The name as every list of the order shows it: the cut wraps the link, and
 * the title carries the choreography number no column shows.
 */
export function ProgramRowName({
  row,
  to,
}: {
  row: ProgramListRow;
  to: string | null;
}) {
  if (to === null) {
    return <DataTableTruncatedText value={row.name} />;
  }

  return (
    <DataTableTruncatedText
      value={`${row.name} · ${formatEventSequenceNumber(row.choreographyNumber)}`}
    >
      <DataTableLink recordTitle to={to}>
        {row.name}
      </DataTableLink>
    </DataTableTruncatedText>
  );
}

import type { ReactNode } from "react";

import { Check } from "lucide-react";

import { DataTableTruncatedText } from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";
import { cn } from "@/lib/shared/utils";

import { formatProgramOrderNumber, type ProgramListRow } from "./shared";

/**
 * A row of the order as a card on a phone, for every list built on
 * `ProgramListRow`: the name and its number, then what the row is in a muted
 * line. What comes last is each list's own — the result's award and average,
 * or who dances. Nothing in a card is cut: a phone has no hover for the
 * `title` a cut cell keeps, so long values wrap instead.
 *
 * An evaluated card, on the public program's day being danced, fades all but
 * its number, which turns into a green badge: the faded run is what the show
 * has left behind, and the badge says so where the eye lands first.
 */
export function ProgramRowCard({
  children,
  evaluated = false,
  row,
  showLevel,
  to,
}: {
  children?: ReactNode;
  evaluated?: boolean;
  row: ProgramListRow;
  /** As the list's `Nivel` column: only where the table carries it. */
  showLevel: boolean;
  to: string | null;
}) {
  const number = `N.º ${formatProgramOrderNumber(row) || "—"}`;
  const faded = evaluated ? "opacity-55" : undefined;

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <div className={cn("min-w-0 font-medium wrap-break-word", faded)}>
          {to === null ? (
            row.name
          ) : (
            <DataTableLink className="whitespace-normal" recordTitle to={to}>
              {row.name}
            </DataTableLink>
          )}
        </div>
        {evaluated ? (
          <Badge variant="success" className="shrink-0 tabular-nums">
            <Check aria-hidden="true" />
            <span className="sr-only">Ya se presentó, </span>
            {number}
          </Badge>
        ) : (
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {number}
          </span>
        )}
      </div>
      <p className={cn("text-xs wrap-break-word text-muted-foreground", faded)}>
        {[
          formatPrimaryAndSecondaryValue(row.modalityName, row.submodalityName),
          formatPrimaryAndSecondaryValue(
            row.categoryName,
            formatGroupTypeLabel(row.groupType),
          ),
          showLevel ? row.levelLabel : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {evaluated ? <div className={faded}>{children}</div> : children}
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

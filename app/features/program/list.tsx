import { choreographyClassificationColumns } from "@/components/shared/choreography-classification-columns";
import { CircleCheck, CircleMinus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  ClientDataTable,
  DataTableTruncatedText,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { defaultClientDataTablePageSize } from "@/components/shared/data-table.shared";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { withdrawnChoreographyStatusLabel } from "@/lib/choreographies/operational-status";
import { matchesPresentationSearch } from "@/lib/presentations/search";
import { cn } from "@/lib/shared/utils";

import { ScheduleDayTabs } from "./day-tabs";
import type { ProgramLive } from "./live-day";
import { ProgramRowCard, ProgramRowName } from "./row-card";
import {
  formatProgramOrderNumber,
  listProgramDays,
  type ProgramListRow,
} from "./shared";
import { useProgramLiveDay } from "./use-live-day";

/**
 * The list of an event's order as everyone outside the administration reads it:
 * the academy's own page on the portal and the public program. It is written
 * once so the two surfaces stay one design — the public page adds the academy
 * column and the portal the level, and nothing else differs.
 */

export type ProgramListProps = {
  /** Where a row's name links, or `null` to render it as plain text. */
  choreographyPath?: ((row: ProgramListRow) => string) | null;
  /**
   * The day being danced, which only the public program follows: its tab's
   * `En vivo` badge and its evaluated rows. See `live-day.ts`.
   */
  live?: ProgramLive | null;
  /** Asks the route for fresh data, every minute while the day is live. */
  onLivePoll?: () => void;
  rows: ProgramListRow[];
  /** The public page names who dances; an academy already knows. */
  showAcademy: boolean;
  /**
   * The `Nivel` column, which only the academy's own page carries: it tells
   * apart two presentations that differ in nothing else. The public program
   * keeps the columns it has always had.
   */
  showLevel?: boolean;
  /**
   * What goes right under the tabs for the chosen day: the public program's
   * award ceremonies of that day. The portal has none.
   */
  renderDayNotice?: (day: string) => ReactNode;
};

export function ProgramList({
  choreographyPath = null,
  live = null,
  onLivePoll,
  renderDayNotice,
  rows,
  showAcademy,
  showLevel = false,
}: ProgramListProps) {
  // The day narrows what is on screen and nothing else: the whole list is
  // already here. It is in the URL all the same, so a reload or a link shared
  // from a phone lands on the day it was read on.
  const days = listProgramDays(rows);
  const liveView = useProgramLiveDay({
    days,
    live,
    onPoll: onLivePoll,
    pageSize: defaultClientDataTablePageSize,
    rows,
  });
  const { tab } = liveView;
  const visibleRows = rows.filter((row) => row.scheduledDate === tab.value);

  return (
    <ScheduleDayTabs days={days} liveDay={liveView.liveBadgeDay} tab={tab}>
      <div className="flex flex-col gap-3">
        {renderDayNotice?.(tab.value)}

        <ClientDataTable
          rows={visibleRows}
          columns={buildProgramColumns({
            choreographyPath,
            evaluatedChoreographyIds: liveView.evaluatedChoreographyIds,
            showAcademy,
            showLevel,
          })}
          getRowKey={(row) => row.choreographyId}
          layout="fit"
          // One search on every list of the order; the academy only where the
          // list shows it.
          matchesSearch={(row, search) =>
            matchesPresentationSearch(search, {
              academyName: showAcademy ? row.academyName : undefined,
              choreographyNumber: row.choreographyNumber,
              name: row.name,
              orderNumber: row.orderNumber,
            })
          }
          renderCard={(row) => (
            <ProgramRowCard
              evaluated={liveView.evaluatedChoreographyIds.has(
                row.choreographyId,
              )}
              row={row}
              showLevel={showLevel}
              to={choreographyPath?.(row) ?? null}
            >
              <ProgramCardWho row={row} showAcademy={showAcademy} />
            </ProgramRowCard>
          )}
          searchPlaceholder={
            showAcademy
              ? "Buscar por número, nombre o academia"
              : "Buscar por número o nombre"
          }
          initialSort={{ columnId: "orden", direction: "asc" }}
          emptyMessage="No hay presentaciones que coincidan con la búsqueda."
        />
      </div>
    </ScheduleDayTabs>
  );
}

/**
 * The participation list's column order — the number, who dances, then what
 * the order groups by — with its weights minus the columns this surface lacks.
 */
function buildProgramColumns({
  choreographyPath,
  evaluatedChoreographyIds,
  showAcademy,
  showLevel,
}: {
  choreographyPath: ((row: ProgramListRow) => string) | null;
  evaluatedChoreographyIds: ReadonlySet<string>;
  showAcademy: boolean;
  showLevel: boolean;
}): DataTableColumn<ProgramListRow>[] {
  const columns: Array<DataTableColumn<ProgramListRow> | null> = [
    {
      id: "orden",
      header: "N.º",
      width: 8,
      className: "font-medium tabular-nums",
      // The number carries the row's one mark beside it: the check of a
      // presentation already danced, or the minus of a withdrawn one. They
      // never meet, since a withdrawn presentation is never evaluated.
      cell: (row) => (
        <ProgramOrderNumber
          evaluated={evaluatedChoreographyIds.has(row.choreographyId)}
          row={row}
        />
      ),
      // The only sortable column, as on the participation list.
      sortValue: (row) => row.orderNumber,
    },
    {
      id: "name",
      header: "Nombre",
      width: selectNameWidth({ showAcademy, showLevel }),
      className: "font-medium",
      cell: (row) => (
        <ProgramRowName row={row} to={choreographyPath?.(row) ?? null} />
      ),
    },
    showAcademy
      ? {
          id: "academy",
          header: "Academia",
          width: 19,
          className: "text-muted-foreground",
          cell: (row) => <DataTableTruncatedText value={row.academyName} />,
        }
      : null,
    ...choreographyClassificationColumns<ProgramListRow>(),
    {
      id: "dancers",
      header: "Bailarines",
      width: showLevel ? 14 : 17,
      className: "text-muted-foreground",
      cell: (row) => (
        <DataTableTruncatedText value={formatProgramDancer(row)} />
      ),
    },
    showLevel
      ? {
          id: "experienceLevel",
          header: "Nivel",
          width: 11,
          className: "text-muted-foreground",
          cell: (row) => <DataTableTruncatedText value={row.levelLabel} />,
        }
      : null,
  ];

  return columns.filter(
    (column): column is DataTableColumn<ProgramListRow> => column !== null,
  );
}

/**
 * The number and, beside it, the row's mark: a withdrawn row keeps the number
 * it was announced with, so the numbering shows no unexplained gap, and the
 * minus says why it will not be danced.
 */
function ProgramOrderNumber({
  evaluated,
  row,
}: {
  evaluated: boolean;
  row: ProgramListRow;
}) {
  const number = formatProgramOrderNumber(row);

  if (row.withdrawn) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {number}
        <OrderNumberMark
          icon={CircleMinus}
          iconClassName="text-muted-foreground"
          label={withdrawnChoreographyStatusLabel}
        />
      </span>
    );
  }

  if (evaluated) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {number}
        <OrderNumberMark
          icon={CircleCheck}
          iconClassName="text-success"
          label="Ya se presentó"
        />
      </span>
    );
  }

  return number;
}

function OrderNumberMark({
  icon: Icon,
  iconClassName,
  label,
}: {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        {/* Focusable, since the tooltip is the mark's only visible
            explanation: a keyboard reader reaches it like a pointer does. */}
        <TooltipTrigger asChild>
          <span
            className="inline-flex rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            tabIndex={0}
          >
            <Icon aria-hidden="true" className={cn("size-4", iconClassName)} />
            <span className="sr-only">{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * The name takes whatever the columns beside it leave: the academy column and
 * the level each take their share of it.
 */
function selectNameWidth({
  showAcademy,
  showLevel,
}: {
  showAcademy: boolean;
  showLevel: boolean;
}) {
  if (showAcademy) {
    return 19;
  }

  // The width the state column held before it left the academy's page.
  return showLevel ? 28 : 37;
}

/**
 * Only a solo names its dancer: one line per row keeps the program's rows as
 * tall as the participation list's, and a group's names would not fit anyway.
 */
function formatProgramDancer(row: ProgramListRow) {
  return row.groupType === "solo" ? (row.dancerNames[0] ?? "—") : "—";
}

/**
 * The card's last line is who dances, where the table has the `Academia` and
 * `Bailarines` columns. A group's names are not there either, so a portal card
 * of a group ends on what the row is.
 */
function ProgramCardWho({
  row,
  showAcademy,
}: {
  row: ProgramListRow;
  showAcademy: boolean;
}) {
  const who = [
    showAcademy ? row.academyName : null,
    row.groupType === "solo" ? row.dancerNames[0] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return who ? <p className="text-sm wrap-break-word">{who}</p> : null;
}

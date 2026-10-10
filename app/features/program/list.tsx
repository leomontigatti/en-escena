import type { ReactNode } from "react";

import {
  ClientDataTable,
  DataTableTruncatedText,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { matchesPresentationSearch } from "@/lib/presentations/search";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import {
  allDaysTabValue,
  ScheduleDayTabs,
  useScheduleDayTab,
} from "./day-tabs";
import { ProgramRowCard, ProgramRowName } from "./row-card";
import {
  formatProgramOrderNumber,
  listProgramDays,
  type ProgramListRow,
} from "./shared";

/**
 * The list of an event's order as everyone outside the administration reads it:
 * the academy's own page on the portal and the public program. It is written
 * once so the two surfaces stay one design — the public page adds the academy
 * column and the portal the level, and nothing else differs.
 */

export type ProgramListProps = {
  /** Where a row's name links, or `null` to render it as plain text. */
  choreographyPath?: ((row: ProgramListRow) => string) | null;
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
   * What goes right under the tabs while one day is chosen, never on `Todos`:
   * the public program's award ceremonies of that day. The portal has none.
   */
  renderDayNotice?: (day: string) => ReactNode;
};

export function ProgramList({
  choreographyPath = null,
  renderDayNotice,
  rows,
  showAcademy,
  showLevel = false,
}: ProgramListProps) {
  // The day narrows what is on screen and nothing else: the whole list is
  // already here. It is in the URL all the same, so a reload or a link shared
  // from a phone lands on the day it was read on.
  const days = listProgramDays(rows);
  const tab = useScheduleDayTab(days);
  const visibleRows =
    tab.value === allDaysTabValue
      ? rows
      : rows.filter((row) => row.scheduledDate === tab.value);

  return (
    // `gap-3` and the tab row's `pb-1` add up to the 16px every list keeps
    // between its tabs and its search.
    <div className="flex flex-col gap-3">
      <ScheduleDayTabs days={days} tab={tab} />
      {tab.value === allDaysTabValue ? null : renderDayNotice?.(tab.value)}

      <ClientDataTable
        rows={visibleRows}
        columns={buildProgramColumns({
          choreographyPath,
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
  );
}

/**
 * The participation list's column order — the number, who dances, then what
 * the order groups by — with its weights minus the columns this surface lacks.
 */
function buildProgramColumns({
  choreographyPath,
  showAcademy,
  showLevel,
}: {
  choreographyPath: ((row: ProgramListRow) => string) | null;
  showAcademy: boolean;
  showLevel: boolean;
}): DataTableColumn<ProgramListRow>[] {
  const columns: Array<DataTableColumn<ProgramListRow> | null> = [
    {
      id: "orden",
      header: "N.º",
      width: 8,
      className: "font-medium tabular-nums",
      cell: formatProgramOrderNumber,
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
    {
      id: "modality",
      header: "Modalidad / Submodalidad",
      width: 21,
      className: "text-muted-foreground",
      cell: (row) => (
        <DataTableTruncatedText
          value={formatPrimaryAndSecondaryValue(
            row.modalityName,
            row.submodalityName,
          )}
        />
      ),
    },
    {
      id: "categoryGroup",
      header: "Categoría / Tipo de grupo",
      width: 20,
      className: "text-muted-foreground",
      cell: (row) => (
        <DataTableTruncatedText
          value={formatPrimaryAndSecondaryValue(
            row.categoryName,
            formatGroupTypeLabel(row.groupType),
          )}
        />
      ),
    },
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
          cell: (row) => (
            <DataTableTruncatedText value={row.levelLabel ?? "—"} />
          ),
        }
      : null,
  ];

  return columns.filter(
    (column): column is DataTableColumn<ProgramListRow> => column !== null,
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

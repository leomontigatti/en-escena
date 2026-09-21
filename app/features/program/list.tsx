import { useState } from "react";

import {
  ClientDataTable,
  DataTableTruncatedText,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatScheduleDayLabel } from "@/lib/choreographies/schedule-formatters";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import {
  formatProgramOrderNumber,
  listProgramDays,
  type ProgramListRow,
} from "./shared";

/**
 * The list of an event's order as everyone outside the administration reads it:
 * the academy's own page on the portal and the public program. It is written
 * once so the two surfaces stay one design — the public page adds the academy
 * column and drops the state, and nothing else differs.
 */

const allDaysTabValue = "todos";

export type ProgramListProps = {
  /** Where a row's name links, or `null` to render it as plain text. */
  choreographyPath?: ((row: ProgramListRow) => string) | null;
  rows: ProgramListRow[];
  /** The public page names who dances; an academy already knows. */
  showAcademy: boolean;
};

export function ProgramList({
  choreographyPath = null,
  rows,
  showAcademy,
}: ProgramListProps) {
  // The day narrows what is on screen and nothing else: the whole list is
  // already here, so the tab is reading state rather than a query.
  const [day, setDay] = useState(allDaysTabValue);
  const days = listProgramDays(rows);
  const visibleRows =
    day === allDaysTabValue
      ? rows
      : rows.filter((row) => row.scheduledDate === day);

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={days.includes(day) ? day : allDaysTabValue}>
        <TabsList variant="line">
          <TabsTrigger
            value={allDaysTabValue}
            onClick={() => setDay(allDaysTabValue)}
          >
            Todos
          </TabsTrigger>
          {days.map((eventDay) => (
            <TabsTrigger
              key={eventDay}
              value={eventDay}
              onClick={() => setDay(eventDay)}
            >
              {formatScheduleDayLabel(eventDay)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <ClientDataTable
        rows={visibleRows}
        columns={buildProgramColumns({ choreographyPath, showAcademy })}
        getRowKey={(row) => row.choreographyId}
        layout="fit"
        searchPlaceholder={
          showAcademy
            ? "Buscar por número de presentación, nombre o academia"
            : "Buscar por número de presentación o nombre"
        }
        textFilterColumnId="nombre"
        // The whole program is worth reading at once, and it has to print.
        hidePagination
        // `hidePagination` only hides the control, so the page size is what
        // decides whether a large event is truncated on screen: the program
        // holds one page, whatever the event's size.
        pageSize={Math.max(visibleRows.length, 1)}
        initialSort={{ columnId: "orden", direction: "asc" }}
        emptyMessage="No hay presentaciones que coincidan con la búsqueda."
      />
    </div>
  );
}

/**
 * The participation list's column order — the number, what the order groups by,
 * then who and what — with its weights minus the columns this surface lacks.
 */
function buildProgramColumns({
  choreographyPath,
  showAcademy,
}: {
  choreographyPath: ((row: ProgramListRow) => string) | null;
  showAcademy: boolean;
}): DataTableColumn<ProgramListRow>[] {
  const columns: Array<DataTableColumn<ProgramListRow> | null> = [
    {
      id: "orden",
      header: "N.º",
      width: 9,
      className: "font-medium tabular-nums",
      cell: formatProgramOrderNumber,
      // The only sortable column, as on the participation list.
      sortValue: (row) => row.orderNumber,
    },
    {
      id: "categoriaTipoGrupo",
      header: "Categoría / Tipo de grupo",
      width: 16,
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
      id: "modalidadSubmodalidad",
      header: "Modalidad / Submodalidad",
      width: 20,
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
    showAcademy
      ? {
          id: "academia",
          header: "Academia",
          width: 19,
          className: "text-muted-foreground",
          cell: (row) => <DataTableTruncatedText value={row.academyName} />,
        }
      : null,
    {
      id: "nombre",
      header: "Nombre",
      width: showAcademy ? 19 : 26,
      className: "font-medium",
      cell: (row) =>
        choreographyPath ? (
          // The same shape as the participation list: the cut wraps the link,
          // and the title carries the choreography number no column shows.
          <DataTableTruncatedText
            value={`${row.name} · ${formatEventSequenceNumber(row.choreographyNumber)}`}
          >
            <DataTableLink to={choreographyPath(row)}>{row.name}</DataTableLink>
          </DataTableTruncatedText>
        ) : (
          <DataTableTruncatedText value={row.name} />
        ),
      // Everything meant to be searchable travels in this column.
      filterValue: (row) =>
        [
          formatProgramOrderNumber(row),
          formatEventSequenceNumber(row.choreographyNumber),
          row.name,
          showAcademy ? row.academyName : "",
        ]
          .filter(Boolean)
          .join(" "),
    },
    {
      id: "bailarines",
      header: "Bailarines",
      width: 17,
      className: "text-muted-foreground",
      cell: (row) => <ProgramDancerNames row={row} />,
    },
    // The academy's own page keeps the participation list's `Estado`, with the
    // two badges that can reach it; the public program carries no state.
    showAcademy
      ? null
      : {
          id: "estado",
          header: "Estado",
          width: 11,
          cell: (row) => {
            // The pending deposit leads: it is the one thing the academy can
            // act on, and a row without a number is only waiting.
            if (row.isBelowDeposit) {
              return <Badge variant="warning">Seña pendiente</Badge>;
            }

            return row.orderNumber === null ? (
              <Badge variant="info">Sin número</Badge>
            ) : null;
          },
        },
  ];

  return columns.filter(
    (column): column is DataTableColumn<ProgramListRow> => column !== null,
  );
}

/**
 * Always two lines tall, whatever it holds, so a duo does not make its row
 * taller than the rest of the program.
 */
function ProgramDancerNames({ row }: { row: ProgramListRow }) {
  return (
    <div className="flex h-10 flex-col justify-center">
      {row.dancerNames.map((dancerName) => (
        <DataTableTruncatedText key={dancerName} value={dancerName} />
      ))}
    </div>
  );
}

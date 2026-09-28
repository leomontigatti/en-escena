import type { ReactNode } from "react";

import { DataTableTruncatedText } from "@/components/shared/data-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import type {
  EventProgramRow,
  EventProgramSchedule,
} from "@/lib/presentations/event-program.server";
import { isDateOnly } from "@/lib/shared/date-only";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";
import { cn } from "@/lib/shared/utils";

import { formatProgramOrderNumber } from "../shared";

/**
 * The printed program, which is its own layout rather than the screen's: A4
 * landscape, one page run per schedule under the heading that names it, and
 * column headers once per schedule instead of once per page.
 *
 * A zero `@page` margin is what leaves the browser no room for its own header
 * and footer; the spacer rows of the outer table put the margin back on every
 * page, since a table repeats its `thead` and `tfoot` wherever it breaks.
 */

/** The program's own columns, keyed the way the screen lists key them. */
type ProgramPrintColumnId =
  "orden" | "nombre" | "academia" | "modalidad" | "categoria" | "bailarines";

/** A column of the printed program; the widths are percentages that add to 100. */
export type ProgramPrintColumn<Row> = {
  cell: (row: Row) => ReactNode;
  className?: string;
  header: ReactNode;
  id: string;
  width: number;
};

/**
 * How the columns deal with a value longer than their width. `compact` keeps
 * every row one line, the pairs on it as the screen lists write them, and cuts
 * what does not fit: the public program's names are short enough to read. The
 * `wrapped` layout cuts nothing — the pairs stack, one value above the other,
 * and a long name takes a second line — because a sheet of results is read out
 * and handed over, and a cut name on paper is a name lost.
 */
type ProgramPrintLayout = "compact" | "wrapped";

/**
 * The program's own columns, in the participation list's order — the number,
 * who dances, then what the order groups by — at the widths the caller gives
 * them: the public program spends the whole page on them, and a print that
 * adds columns of its own rebalances them to make room.
 */
export function programPrintColumns({
  layout,
  widths,
}: {
  layout: ProgramPrintLayout;
  widths: Record<ProgramPrintColumnId, number>;
}): ProgramPrintColumn<EventProgramRow>[] {
  const wraps = layout === "wrapped" ? programPrintWrapClassName : "";

  return [
    {
      id: "orden",
      header: "N.º",
      width: widths.orden,
      className: "font-medium tabular-nums",
      cell: (row) => formatProgramOrderNumber(row),
    },
    {
      id: "nombre",
      header: "Nombre",
      width: widths.nombre,
      className: cn("font-medium", wraps),
      cell: (row) => <PrintText layout={layout} value={row.name} />,
    },
    {
      id: "academia",
      header: "Academia",
      width: widths.academia,
      className: cn("text-muted-foreground", wraps),
      cell: (row) => <PrintText layout={layout} value={row.academyName} />,
    },
    {
      id: "modalidad",
      header: printPairHeader(layout, "Modalidad", "Submodalidad"),
      width: widths.modalidad,
      className: cn("text-muted-foreground", wraps),
      cell: (row) => (
        <PrintPair
          layout={layout}
          primary={row.modalityName}
          secondary={row.submodalityName}
        />
      ),
    },
    {
      id: "categoria",
      header: printPairHeader(layout, "Categoría", "Tipo de grupo"),
      width: widths.categoria,
      className: cn("text-muted-foreground", wraps),
      cell: (row) => (
        <PrintPair
          layout={layout}
          primary={row.categoryName}
          secondary={formatGroupTypeLabel(row.groupType)}
        />
      ),
    },
    {
      id: "bailarines",
      header: "Bailarines",
      width: widths.bailarines,
      className: cn("text-muted-foreground", wraps),
      cell: (row) => <PrintLines layout={layout} lines={row.dancerNames} />,
    },
  ];
}

/** What a column of the `wrapped` layout adds to let its text break. */
export const programPrintWrapClassName = "whitespace-normal break-words";

/** "Modalidad / Submodalidad" on one line, or one word above the other. */
function printPairHeader(
  layout: ProgramPrintLayout,
  primary: string,
  secondary: string,
): ReactNode {
  return layout === "wrapped" ? (
    <PrintLines layout={layout} lines={[primary, secondary]} />
  ) : (
    `${primary} / ${secondary}`
  );
}

/**
 * A pair on one line, "Jazz · Lírico" as the screen lists write it, or on two,
 * one above the other. A missing secondary value leaves the primary alone.
 */
function PrintPair({
  layout,
  primary,
  secondary,
}: {
  layout: ProgramPrintLayout;
  primary: string;
  secondary: string | null;
}) {
  if (layout === "wrapped") {
    return (
      <PrintLines
        layout={layout}
        lines={secondary ? [primary, secondary] : [primary]}
      />
    );
  }

  return (
    <DataTableTruncatedText
      value={formatPrimaryAndSecondaryValue(primary, secondary)}
    />
  );
}

/**
 * Two lines tall in `compact`, whatever it holds, so every row of a page is one
 * height; at least that in `wrapped`, where a long line breaks and grows it.
 */
function PrintLines({
  layout,
  lines,
}: {
  layout: ProgramPrintLayout;
  lines: string[];
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-center",
        layout === "wrapped" ? "min-h-10" : "h-10",
      )}
    >
      {lines.map((line) => (
        <PrintText key={line} layout={layout} value={line} />
      ))}
    </div>
  );
}

function PrintText({
  layout,
  value,
}: {
  layout: ProgramPrintLayout;
  value: string;
}) {
  return layout === "wrapped" ? (
    <span>{value}</span>
  ) : (
    <DataTableTruncatedText value={value} />
  );
}

const publicProgramColumns = programPrintColumns({
  layout: "compact",
  widths: {
    orden: 7,
    nombre: 18,
    academia: 18,
    modalidad: 20,
    categoria: 20,
    bailarines: 17,
  },
});

/** The margin the zero `@page` gives up and the spacer rows give back. */
const printPageMargin = "12mm";

const printWeekdayAndDate = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** "sábado 17 de octubre 10:00 hs · Sábado mañana" */
export function formatProgramScheduleLabel(schedule: EventProgramSchedule) {
  // Shape alone is not enough: `2026-13-40` splits into three parts and is
  // still no date at all, and formatting one throws rather than answering —
  // which on the public program would take the whole route down. The heading
  // falls back to the stored value, the way `formatScheduleDayLabel` does.
  const day = isDateOnly(schedule.scheduledDate)
    ? printWeekdayAndDate
        .format(new Date(`${schedule.scheduledDate}T00:00:00Z`))
        .replace(",", "")
    : schedule.scheduledDate;

  return `${day} ${schedule.startTime} hs · ${schedule.name}`;
}

export function PrintableProgram({
  eventName,
  rows,
  schedules,
}: {
  eventName: string;
  rows: EventProgramRow[];
  schedules: EventProgramSchedule[];
}) {
  return (
    <div className="hidden print:block">
      <ProgramPrintPages
        columns={publicProgramColumns}
        eventName={eventName}
        rows={rows}
        schedules={schedules}
      />
    </div>
  );
}

/**
 * The page runs themselves, one per schedule, for any row that is at least a
 * program row. Whoever renders them decides when they show: the public program
 * only on paper, the results print on screen too.
 */
export function ProgramPrintPages<Row extends EventProgramRow>({
  columns,
  eventName,
  rows,
  schedules,
}: {
  columns: ProgramPrintColumn<Row>[];
  eventName: string;
  rows: Row[];
  schedules: EventProgramSchedule[];
}) {
  return (
    <>
      <style>{"@page { size: A4 landscape; margin: 0; }"}</style>
      {schedules.map((schedule, index) => (
        <table
          key={schedule.id}
          className={index > 0 ? "w-full break-before-page" : "w-full"}
        >
          <thead>
            <tr>
              <td style={{ height: printPageMargin }} />
            </tr>
          </thead>
          <tfoot>
            <tr>
              <td style={{ height: printPageMargin }} />
            </tr>
          </tfoot>
          <tbody>
            <tr>
              <td
                style={{
                  paddingLeft: printPageMargin,
                  paddingRight: printPageMargin,
                }}
              >
                <h2 className="mb-4 text-center text-lg font-semibold">
                  {`${eventName} · ${formatProgramScheduleLabel(schedule)}`}
                </h2>
                <Table className="table-fixed">
                  <colgroup>
                    {columns.map((column) => (
                      <col
                        key={column.id}
                        style={{ width: `${column.width}%` }}
                      />
                    ))}
                  </colgroup>
                  {/* A row group, not a header group: printed once per schedule. */}
                  <TableHeader className="[display:table-row-group]">
                    <TableRow>
                      {columns.map((column) => (
                        <TableHead key={column.id}>{column.header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows
                      .filter((row) => row.scheduleId === schedule.id)
                      .map((row) => (
                        <TableRow
                          key={row.choreographyId}
                          className="break-inside-avoid"
                        >
                          {columns.map((column) => (
                            <TableCell
                              key={column.id}
                              className={column.className}
                            >
                              {column.cell(row)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </>
  );
}

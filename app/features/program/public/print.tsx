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
  EventProgramCeremonySchedule,
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

/** A column of the printed program; the widths are percentages that add to 100. */
type ProgramPrintColumn<Row> = {
  cell: (row: Row) => ReactNode;
  className?: string;
  header: ReactNode;
  id: string;
  width: number;
};

/**
 * The program's own columns, in the participation list's order — the number,
 * who dances, then what the order groups by. Every row stays one line, the
 * pairs on it as the screen lists write them, and what does not fit is cut:
 * the public program's names are short enough to read.
 */
const publicProgramColumns: ProgramPrintColumn<EventProgramRow>[] = [
  {
    id: "order",
    header: "N.º",
    width: 7,
    className: "font-medium tabular-nums",
    cell: (row) => formatProgramOrderNumber(row),
  },
  {
    id: "name",
    header: "Nombre",
    width: 18,
    className: "font-medium",
    cell: (row) => <DataTableTruncatedText value={row.name} />,
  },
  {
    id: "academy",
    header: "Academia",
    width: 18,
    className: "text-muted-foreground",
    cell: (row) => <DataTableTruncatedText value={row.academyName} />,
  },
  {
    id: "modality",
    header: "Modalidad / Submodalidad",
    width: 20,
    className: "text-muted-foreground",
    cell: (row) => (
      <PrintPair primary={row.modalityName} secondary={row.submodalityName} />
    ),
  },
  {
    id: "categoryGroup",
    header: "Categoría / Tipo de grupo",
    width: 20,
    className: "text-muted-foreground",
    cell: (row) => (
      <PrintPair
        primary={row.categoryName}
        secondary={formatGroupTypeLabel(row.groupType)}
      />
    ),
  },
  {
    id: "dancers",
    header: "Bailarines",
    width: 17,
    className: "text-muted-foreground",
    cell: (row) => <PrintLines lines={row.dancerNames} />,
  },
];

/**
 * A pair on one line, "Jazz · Lírico" as the screen lists write it. A missing
 * secondary value leaves the primary alone.
 */
function PrintPair({
  primary,
  secondary,
}: {
  primary: string;
  secondary: string | null;
}) {
  return (
    <DataTableTruncatedText
      value={formatPrimaryAndSecondaryValue(primary, secondary)}
    />
  );
}

/** Two lines tall, whatever it holds, so every row of a page is one height. */
function PrintLines({ lines }: { lines: string[] }) {
  return (
    <div className="flex h-10 flex-col justify-center">
      {lines.map((line) => (
        <DataTableTruncatedText key={line} value={line} />
      ))}
    </div>
  );
}

/** The margin the zero `@page` gives up and the spacer rows give back. */
const printPageMargin = "12mm";

const printWeekdayAndDate = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/**
 * The caveat the public program carries on screen, as an alert, and on paper,
 * under every page run's heading. The order is the organisation's to change
 * until the day, and the times follow the order.
 */
export const programScheduleNotice =
  "Los horarios son estimativos y el orden de las presentaciones puede cambiar hasta el día del evento.";

/** "sábado 17 de octubre", the day as a printed heading names it. */
function formatPrintDay(date: string) {
  // Shape alone is not enough: `2026-13-40` splits into three parts and is
  // still no date at all, and formatting one throws rather than answering —
  // which on the public program would take the whole route down. The heading
  // falls back to the stored value, the way `formatScheduleDayLabel` does.
  return isDateOnly(date)
    ? printWeekdayAndDate.format(new Date(`${date}T00:00:00Z`)).replace(",", "")
    : date;
}

/** "sábado 17 de octubre 10:00 hs · Sábado mañana" */
function formatProgramScheduleLabel(schedule: EventProgramSchedule) {
  return `${formatPrintDay(schedule.scheduledDate)} ${schedule.startTime} hs · ${schedule.name}`;
}

/**
 * The line that closes a schedule's page run: "Entrega de premios · 22:30 hs",
 * with the day in front of the hour when the ceremony is not on the schedule's
 * own day (one after midnight falls on the next). `null` when the schedule has
 * no ceremony, which prints nothing.
 */
export function formatProgramAwardCeremonyLabel(
  schedule: EventProgramCeremonySchedule,
) {
  const { awardCeremonyDate, awardCeremonyTime } = schedule;

  if (awardCeremonyDate === null || awardCeremonyTime === null) {
    return null;
  }

  const when =
    awardCeremonyDate === schedule.scheduledDate
      ? `${awardCeremonyTime} hs`
      : `${formatPrintDay(awardCeremonyDate)} ${awardCeremonyTime} hs`;

  return `Entrega de premios · ${when}`;
}

export function PrintableProgram({
  eventName,
  rows,
  schedules,
}: {
  eventName: string;
  rows: EventProgramRow[];
  schedules: EventProgramCeremonySchedule[];
}) {
  return (
    <div className="hidden print:block">
      <ProgramPrintPages
        columns={publicProgramColumns}
        eventName={eventName}
        notice={programScheduleNotice}
        renderAfterRows={formatProgramAwardCeremonyLabel}
        rows={rows}
        schedules={schedules}
      />
    </div>
  );
}

/**
 * The page runs themselves, one per schedule, for any row that is at least a
 * program row. Whoever renders them decides when they show: the public program
 * shows them only on paper. The notice under each heading and the line after
 * each run's rows are optional.
 */
function ProgramPrintPages<
  Row extends EventProgramRow,
  Schedule extends EventProgramSchedule,
>({
  columns,
  eventName,
  notice,
  renderAfterRows,
  rows,
  schedules,
}: {
  columns: ProgramPrintColumn<Row>[];
  eventName: string;
  notice?: string;
  renderAfterRows?: (schedule: Schedule) => string | null;
  rows: Row[];
  schedules: Schedule[];
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
                <h2
                  className={cn(
                    "text-center text-lg font-semibold",
                    notice ? "mb-1" : "mb-4",
                  )}
                >
                  {`${eventName} · ${formatProgramScheduleLabel(schedule)}`}
                </h2>
                {notice ? (
                  <p className="mb-4 text-center text-xs text-muted-foreground">
                    {notice}
                  </p>
                ) : null}
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
                <ProgramPrintAfterRows text={renderAfterRows?.(schedule)} />
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </>
  );
}

/** The centred line after a page run's last row, when there is one. */
function ProgramPrintAfterRows({ text }: { text: string | null | undefined }) {
  return text ? (
    <p className="mt-6 text-center text-base font-semibold">{text}</p>
  ) : null;
}

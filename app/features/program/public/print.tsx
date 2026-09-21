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

const printColumns = [
  { header: "N.º", width: 9 },
  { header: "Categoría", width: 16 },
  { header: "Modalidad", width: 20 },
  { header: "Academia", width: 19 },
  { header: "Nombre", width: 19 },
  { header: "Bailarines", width: 17 },
];

/** The margin the zero `@page` gives up and the spacer rows give back. */
const printPageMargin = "12mm";

const printWeekdayAndDate = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** "En Escena 2026 · sábado 17 de octubre 10:00 hs · Sábado mañana" */
function formatProgramPrintHeading(
  eventName: string,
  schedule: EventProgramSchedule,
) {
  // Shape alone is not enough: `2026-13-40` splits into three parts and is
  // still no date at all, and formatting one throws rather than answering —
  // which on the public program would take the whole route down. The heading
  // falls back to the stored value, the way `formatScheduleDayLabel` does.
  const day = isDateOnly(schedule.scheduledDate)
    ? printWeekdayAndDate
        .format(new Date(`${schedule.scheduledDate}T00:00:00Z`))
        .replace(",", "")
    : schedule.scheduledDate;

  return `${eventName} · ${day} ${schedule.startTime} hs · ${schedule.name}`;
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
                  {formatProgramPrintHeading(eventName, schedule)}
                </h2>
                <Table className="table-fixed">
                  <colgroup>
                    {printColumns.map((column) => (
                      <col
                        key={column.header}
                        style={{ width: `${column.width}%` }}
                      />
                    ))}
                  </colgroup>
                  {/* A row group, not a header group: printed once per schedule. */}
                  <TableHeader className="[display:table-row-group]">
                    <TableRow>
                      {printColumns.map((column) => (
                        <TableHead key={column.header}>
                          {column.header}
                        </TableHead>
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
                          <TableCell className="font-medium tabular-nums">
                            {formatProgramOrderNumber(row)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <DataTableTruncatedText
                              value={formatPrimaryAndSecondaryValue(
                                row.categoryName,
                                formatGroupTypeLabel(row.groupType),
                              )}
                            />
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <DataTableTruncatedText
                              value={formatPrimaryAndSecondaryValue(
                                row.modalityName,
                                row.submodalityName,
                              )}
                            />
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <DataTableTruncatedText value={row.academyName} />
                          </TableCell>
                          <TableCell className="font-medium">
                            <DataTableTruncatedText value={row.name} />
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <div className="flex h-10 flex-col justify-center">
                              {row.dancerNames.map((dancerName) => (
                                <DataTableTruncatedText
                                  key={dancerName}
                                  value={dancerName}
                                />
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </div>
  );
}

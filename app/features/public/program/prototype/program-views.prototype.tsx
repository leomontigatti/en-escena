// PROTOTYPE — throwaway, lives only on branch `prototype/913-program-pages`
// (wayfinder ticket #913, map #907). The program layout after the first review:
// variant A only, aligned with the admin participation list of #912 — same
// column order and weights, same tabs above the search, the same `Estado` badge
// and the same notice shapes.
//
// Written once and rendered by both `/prototipo/programa` (with the academy
// column) and the portal page (without it), so the two surfaces stay one design.
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogIn,
  Printer,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { PortalEmptyState } from "@/components/portal/ui";
import {
  ClientDataTable,
  DataTableTruncatedText,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { EnEscenaAvatar } from "@/components/shared/en-escena-avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/features/admin/schedules/view-shared";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import {
  programSchedules,
  prototypeEvent,
  type ProgramRow,
} from "./program-fixtures.prototype";

type ProgramViewProps = {
  rows: ProgramRow[];
  /** The public page shows who dances; the academy already knows. */
  showAcademy: boolean;
};

// ---------------------------------------------------------------------------
// Formatting

export function formatEventDates() {
  return `del ${formatDate(prototypeEvent.startsAt)} al ${formatDate(prototypeEvent.endsAt)}`;
}

function formatOrderNumber(row: ProgramRow) {
  return row.orderNumber === null ? "" : String(row.orderNumber);
}

// ---------------------------------------------------------------------------
// Public shell: the first unauthenticated content layout.

export function PublicShell({
  session,
  children,
}: {
  session: "anonima" | "academia";
  children: ReactNode;
}) {
  return (
    <>
      <a
        href="#contenido-principal"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-background focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-foreground focus-visible:shadow-md focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
      >
        Saltar al contenido principal
      </a>
      <div className="flex min-h-screen flex-col bg-background">
        <header className="border-b border-border bg-background print:hidden">
          <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-2">
              <EnEscenaAvatar />
              <div className="grid text-sm leading-tight">
                <span className="font-medium">En Escena</span>
                <span className="text-xs text-muted-foreground">
                  Programa del evento
                </span>
              </div>
            </div>
            {session === "academia" ? (
              <Button asChild variant="outline">
                <Link to="/prototipo/portal-presentaciones">
                  <LayoutDashboard
                    aria-hidden="true"
                    data-icon="inline-start"
                  />
                  Ir al portal
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link to="/ingresar">
                  <LogIn aria-hidden="true" data-icon="inline-start" />
                  Ingresar
                </Link>
              </Button>
            )}
          </div>
        </header>
        <main id="contenido-principal" className="flex-1 px-4 py-6 print:p-0">
          <div className="mx-auto flex max-w-6xl flex-col gap-6">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}

/**
 * The public page's header, shaped like `PortalListPage`'s: title, one line of
 * description, one action on the right.
 */
export function PublicProgramHeader() {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Programa</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {prototypeEvent.name}, {formatEventDates()}. El orden de las
          presentaciones puede cambiar hasta el día del evento.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="print:hidden"
        onClick={() => window.print()}
      >
        <Printer aria-hidden="true" data-icon="inline-start" />
        Imprimir
      </Button>
    </header>
  );
}

export function NoPublishedProgram() {
  return (
    <PortalEmptyState
      title="No hay programa publicado"
      description="La organización todavía no publicó el programa del evento. Volvé a consultar más cerca de la fecha."
    />
  );
}

// ---------------------------------------------------------------------------
// The list itself.

/**
 * Columns in #912's block order — number, what the ordering groups by, then who
 * and what — with its weights minus the columns this surface does not have.
 */
function buildColumns({
  showAcademy,
  choreographyPath,
}: {
  showAcademy: boolean;
  choreographyPath: ((row: ProgramRow) => string) | null;
}): DataTableColumn<ProgramRow>[] {
  const columns: Array<DataTableColumn<ProgramRow> | null> = [
    {
      id: "orden",
      header: "N.º",
      width: 9,
      className: "font-medium tabular-nums",
      cell: formatOrderNumber,
      // The only sortable column, as on the admin list.
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
          // Same shape as the admin list: the cut wraps the link, and the
          // title carries the choreography number the column does not show.
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
          formatOrderNumber(row),
          formatEventSequenceNumber(row.choreographyNumber),
          row.name,
          showAcademy ? row.academyName : "",
          row.modalityName,
          row.submodalityName,
          row.categoryName,
        ]
          .filter(Boolean)
          .join(" "),
    },
    {
      id: "bailarines",
      header: "Bailarines",
      width: 17,
      className: "text-muted-foreground",
      cell: (row) => <DancerNames row={row} />,
    },
    // The academy's own page keeps #912's `Estado` column, with the one badge
    // that can reach it: a late choreography the admin has not placed yet.
    !showAcademy
      ? {
          id: "estado",
          header: "Estado",
          width: 11,
          cell: (row) =>
            row.orderNumber === null ? (
              <Badge variant="info">Sin número</Badge>
            ) : null,
        }
      : null,
  ];

  return columns.filter(
    (column): column is DataTableColumn<ProgramRow> => column !== null,
  );
}

/** Names only for solos and duos: a group's list would outgrow the row. */
function listsDancers(row: ProgramRow) {
  return row.groupType === "solo" || row.groupType === "duo";
}

/**
 * Always two lines tall, whatever it holds, so a duo does not make its row
 * taller than the rest of the program.
 */
function DancerNames({ row }: { row: ProgramRow }) {
  return (
    <div className="flex h-10 flex-col justify-center">
      {listsDancers(row)
        ? row.dancerNames.map((dancerName) => (
            <DataTableTruncatedText key={dancerName} value={dancerName} />
          ))
        : null}
    </div>
  );
}

export function ProgramList({
  rows,
  showAcademy,
  choreographyPath = null,
}: ProgramViewProps & {
  choreographyPath?: ((row: ProgramRow) => string) | null;
}) {
  // One tab per day, as on the admin list of #912.
  const [day, setDay] = useState("todos");
  const days = [
    ...new Set(programSchedules.map((schedule) => schedule.scheduledDate)),
  ];
  const visibleRows = rows.filter(
    (row) =>
      day === "todos" ||
      programSchedules.some(
        (schedule) =>
          schedule.id === row.scheduleId && schedule.scheduledDate === day,
      ),
  );

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={day} onValueChange={setDay}>
        <TabsList variant="line">
          <TabsTrigger value="todos">Todos</TabsTrigger>
          {days.map((eventDay) => (
            <TabsTrigger key={eventDay} value={eventDay}>
              {formatDate(eventDay)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <ClientDataTable
        rows={visibleRows}
        columns={buildColumns({
          showAcademy,
          choreographyPath,
        })}
        getRowKey={(row) => row.id}
        layout="fit"
        searchPlaceholder={
          showAcademy
            ? "Buscar por número de presentación, nombre o academia"
            : "Buscar por número de presentación o nombre"
        }
        textFilterColumnId="nombre"
        // The whole program is worth reading at once, and it has to print.
        hidePagination
        pageSize={1000}
        initialSort={{ columnId: "orden", direction: "asc" }}
        emptyMessage="No hay presentaciones que coincidan con la búsqueda."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The printed program: its own layout, not the screen's.

const printColumns = [
  { header: "N.º", width: 9 },
  { header: "Categoría", width: 16 },
  { header: "Modalidad", width: 20 },
  { header: "Academia", width: 19 },
  { header: "Nombre", width: 19 },
  { header: "Bailarines", width: 17 },
];

/**
 * Landscape, one page run per day, headers once per day rather than on every
 * page. A zero `@page` margin is what leaves the browser no room for its own
 * header and footer; the spacer rows of the outer table put the margin back on
 * every page, since a table repeats its `thead` and `tfoot` wherever it breaks.
 */
export function PrintableProgram({ rows }: { rows: ProgramRow[] }) {
  const days = [
    ...new Set(programSchedules.map((schedule) => schedule.scheduledDate)),
  ];

  return (
    <div className="hidden print:block">
      <style>{"@page { size: A4 landscape; margin: 0; }"}</style>
      {days.map((day, index) => {
        const dayRows = rows
          .filter((row) =>
            programSchedules.some(
              (schedule) =>
                schedule.id === row.scheduleId &&
                schedule.scheduledDate === day,
            ),
          )
          .sort(
            (left, right) => (left.orderNumber ?? 0) - (right.orderNumber ?? 0),
          );

        return (
          <table
            key={day}
            className={index > 0 ? "w-full break-before-page" : "w-full"}
          >
            <thead>
              <tr>
                <td className="h-[12mm]" />
              </tr>
            </thead>
            <tfoot>
              <tr>
                <td className="h-[12mm]" />
              </tr>
            </tfoot>
            <tbody>
              <tr>
                <td className="px-[12mm]">
                  <h2 className="mb-3 text-base font-semibold">
                    {prototypeEvent.name} · {formatDate(day)}
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
                    {/* A row group, not a header group: printed once per day. */}
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
                      {dayRows.map((row) => (
                        <TableRow key={row.id} className="break-inside-avoid">
                          <TableCell className="font-medium tabular-nums">
                            {formatOrderNumber(row)}
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
                            <DancerNames row={row} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </td>
              </tr>
            </tbody>
          </table>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The floating bar. Hidden in production builds.

export type PrototypeBarRow = {
  label: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  current: string;
  onSelect: (id: string) => void;
};

export function PrototypeBar({ rows }: { rows: PrototypeBarRow[] }) {
  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 print:hidden">
      <div className="pointer-events-auto flex max-w-4xl flex-col gap-2 rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-muted-foreground">{row.label}</span>
            <Button
              type="button"
              size="icon-xs"
              variant="outline"
              onClick={() => cycle(row, -1)}
            >
              <ChevronLeft aria-hidden="true" data-icon />
              <span className="sr-only">Anterior</span>
            </Button>
            {row.options.map((option) => (
              <Button
                key={option.id}
                type="button"
                size="xs"
                variant={option.id === row.current ? "default" : "outline"}
                onClick={() => row.onSelect(option.id)}
              >
                {option.label}
              </Button>
            ))}
            <Button
              type="button"
              size="icon-xs"
              variant="outline"
              onClick={() => cycle(row, 1)}
            >
              <ChevronRight aria-hidden="true" data-icon />
              <span className="sr-only">Siguiente</span>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function cycle(row: PrototypeBarRow, step: number) {
  const index = row.options.findIndex((option) => option.id === row.current);
  const next =
    row.options[(index + step + row.options.length) % row.options.length];

  if (next) {
    row.onSelect(next.id);
  }
}

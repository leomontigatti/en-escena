// PROTOTYPE — throwaway, lives only on branch `prototype/913-program-pages`
// (wayfinder ticket #913, map #907). The three program layouts, written once and
// rendered by both `/prototipo/programa` (with the academy column) and the
// portal page (without it), so the two surfaces are judged as one design.
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogIn,
  Printer,
  Search,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { PortalEmptyState } from "@/components/portal/ui";
import {
  ClientDataTable,
  DataTableTruncatedText,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { EnEscenaAvatar } from "@/components/shared/en-escena-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/finances/formatters";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import {
  programSchedules,
  prototypeEvent,
  prototypeVariants,
  type ProgramRow,
  type ProgramSchedule,
  type PrototypeVariantId,
} from "./program-fixtures.prototype";

type ProgramViewProps = {
  rows: ProgramRow[];
  showAcademy: boolean;
};

// ---------------------------------------------------------------------------
// Formatting

function scheduleOf(row: ProgramRow): ProgramSchedule {
  return programSchedules.find((schedule) => schedule.id === row.scheduleId)!;
}

export function formatScheduleMoment(schedule: ProgramSchedule) {
  return `${formatDate(schedule.scheduledDate)} · ${schedule.startTime} h`;
}

export function formatEventDates() {
  return `Del ${formatDate(prototypeEvent.startsAt)} al ${formatDate(prototypeEvent.endsAt)}`;
}

function formatOrderNumber(row: ProgramRow) {
  return row.orderNumber === null ? "—" : String(row.orderNumber);
}

function categoryAndGroup(row: ProgramRow) {
  return formatPrimaryAndSecondaryValue(
    row.categoryName,
    formatGroupTypeLabel(row.groupType),
  );
}

function modalityAndSubmodality(row: ProgramRow) {
  return formatPrimaryAndSecondaryValue(row.modalityName, row.submodalityName);
}

function matchesSearch(row: ProgramRow, query: string) {
  const needle = query.trim().toLocaleLowerCase("es");

  if (!needle) {
    return true;
  }

  return [
    formatOrderNumber(row),
    row.name,
    row.academyName,
    row.modalityName,
    row.submodalityName,
    row.categoryName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("es")
    .includes(needle);
}

function byOrderNumber(left: ProgramRow, right: ProgramRow) {
  return (left.orderNumber ?? Infinity) - (right.orderNumber ?? Infinity);
}

function groupBySchedule(rows: ProgramRow[]) {
  return programSchedules
    .map((schedule) => ({
      schedule,
      rows: rows
        .filter((row) => row.scheduleId === schedule.id)
        .sort(byOrderNumber),
    }))
    .filter((group) => group.rows.length > 0);
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
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-background focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-foreground focus-visible:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30"
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
        <main id="contenido-principal" className="flex-1 px-4 py-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-6">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}

export function PublicProgramHeader({ action }: { action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">
          Programa · {prototypeEvent.name}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {formatEventDates()}. El orden de las presentaciones puede cambiar
          hasta el día del evento.
        </p>
      </div>
      {action}
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
// Shared search input, the table toolbar's markup without the table.

function ProgramSearchField({
  query,
  onChange,
  placeholder,
}: {
  query: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block sm:max-w-md sm:flex-1 lg:max-w-xl">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <span className="sr-only">Buscar en el programa</span>
      <Input
        type="text"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="pr-8 pl-8"
      />
      {query.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          onClick={() => onChange("")}
        >
          <X aria-hidden="true" data-icon />
          <span className="sr-only">Limpiar búsqueda</span>
        </Button>
      ) : null}
    </label>
  );
}

function searchPlaceholder(showAcademy: boolean) {
  return showAcademy
    ? "Buscar por número, coreografía o academia"
    : "Buscar por número o coreografía";
}

// ---------------------------------------------------------------------------
// A — one `ClientDataTable`, day tabs above, the schedule as a column.

export function ProgramVariantA({ rows, showAcademy }: ProgramViewProps) {
  const days = [...new Set(programSchedules.map((s) => s.scheduledDate))];
  const [day, setDay] = useState("todos");
  const visibleRows = rows.filter(
    (row) => day === "todos" || scheduleOf(row).scheduledDate === day,
  );

  const columns: DataTableColumn<ProgramRow>[] = [
    {
      id: "orden",
      header: "N.º",
      width: 5,
      className: "font-medium tabular-nums",
      cell: formatOrderNumber,
      sortValue: (row) => row.orderNumber ?? Number.MAX_SAFE_INTEGER,
    },
    {
      id: "nombre",
      header: "Nombre",
      width: 20,
      className: "font-medium",
      cell: (row) => <DataTableTruncatedText value={row.name} />,
      filterValue: (row) =>
        [
          formatOrderNumber(row),
          row.name,
          showAcademy ? row.academyName : "",
        ].join(" "),
    },
    {
      id: "academia",
      header: "Academia",
      width: 18,
      hidden: !showAcademy,
      cell: (row) => <DataTableTruncatedText value={row.academyName} />,
    },
    {
      id: "modalidad",
      header: "Modalidad / Submodalidad",
      width: 19,
      cell: (row) => (
        <DataTableTruncatedText
          className="text-muted-foreground"
          value={modalityAndSubmodality(row)}
        />
      ),
    },
    {
      id: "categoria",
      header: "Categoría / Tipo de grupo",
      width: 18,
      cell: (row) => (
        <DataTableTruncatedText
          className="text-muted-foreground"
          value={categoryAndGroup(row)}
        />
      ),
    },
    {
      id: "cronograma",
      header: "Cronograma",
      width: 16,
      cell: (row) => (
        <DataTableTruncatedText
          className="text-muted-foreground"
          value={formatPrimaryAndSecondaryValue(
            scheduleOf(row).name,
            `${scheduleOf(row).startTime} h`,
          )}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={day} onValueChange={setDay}>
        <TabsList variant="line">
          <TabsTrigger value="todos">Todos</TabsTrigger>
          {days.map((date) => (
            <TabsTrigger key={date} value={date}>
              {formatDate(date)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <ClientDataTable
        rows={visibleRows}
        columns={columns}
        getRowKey={(row) => row.id}
        layout="fit"
        searchPlaceholder={searchPlaceholder(showAcademy)}
        textFilterColumnId="nombre"
        hidePagination
        pageSize={500}
        initialSort={{ columnId: "orden", direction: "asc" }}
        emptyMessage="No hay presentaciones que coincidan con la búsqueda."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// B — one section per schedule, a plain `Table` each, printable as is.

export function ProgramVariantB({
  rows,
  showAcademy,
  printable,
}: ProgramViewProps & { printable: boolean }) {
  const [query, setQuery] = useState("");
  const groups = groupBySchedule(
    rows.filter((row) => matchesSearch(row, query)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <ProgramSearchField
          query={query}
          onChange={setQuery}
          placeholder={searchPlaceholder(showAcademy)}
        />
        {printable ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
          >
            <Printer aria-hidden="true" data-icon="inline-start" />
            Imprimir
          </Button>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay presentaciones que coincidan con la búsqueda.
        </p>
      ) : null}

      {groups.map(({ schedule, rows: scheduleRows }) => (
        <section
          key={schedule.id}
          aria-labelledby={`cronograma-${schedule.id}`}
          className="flex flex-col gap-2 break-inside-avoid-page"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={`cronograma-${schedule.id}`}
              className="text-base font-semibold"
            >
              {schedule.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {formatScheduleMoment(schedule)} · {scheduleRows.length}{" "}
              {scheduleRows.length === 1 ? "presentación" : "presentaciones"}
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">N.º</TableHead>
                  <TableHead>Nombre</TableHead>
                  {showAcademy ? <TableHead>Academia</TableHead> : null}
                  <TableHead>Modalidad / Submodalidad</TableHead>
                  <TableHead>Categoría / Tipo de grupo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduleRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium tabular-nums">
                      {formatOrderNumber(row)}
                    </TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    {showAcademy ? (
                      <TableCell>{row.academyName}</TableCell>
                    ) : null}
                    <TableCell className="text-muted-foreground">
                      {modalityAndSubmodality(row)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {categoryAndGroup(row)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// C — a card per schedule with stacked two-line rows, phone-first.

export function ProgramVariantC({ rows, showAcademy }: ProgramViewProps) {
  const [query, setQuery] = useState("");
  const groups = groupBySchedule(
    rows.filter((row) => matchesSearch(row, query)),
  );

  return (
    <div className="flex flex-col gap-4">
      <ProgramSearchField
        query={query}
        onChange={setQuery}
        placeholder={searchPlaceholder(showAcademy)}
      />

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay presentaciones que coincidan con la búsqueda.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map(({ schedule, rows: scheduleRows }) => (
          <Card key={schedule.id}>
            <CardHeader>
              <CardTitle>{schedule.name}</CardTitle>
              <CardDescription>
                {formatScheduleMoment(schedule)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col divide-y">
                {scheduleRows.map((row) => (
                  <li key={row.id} className="flex items-start gap-3 py-2.5">
                    <Badge
                      variant="outline"
                      className="mt-0.5 min-w-9 justify-center tabular-nums"
                    >
                      {formatOrderNumber(row)}
                    </Badge>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium">
                        {row.name}
                      </span>
                      <span className="text-xs leading-5 text-muted-foreground">
                        {[
                          showAcademy ? row.academyName : null,
                          modalityAndSubmodality(row),
                          categoryAndGroup(row),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ProgramVariant({
  variant,
  ...props
}: ProgramViewProps & { variant: PrototypeVariantId }) {
  if (variant === "B") {
    return <ProgramVariantB {...props} printable={props.showAcademy} />;
  }

  if (variant === "C") {
    return <ProgramVariantC {...props} />;
  }

  return <ProgramVariantA {...props} />;
}

// ---------------------------------------------------------------------------
// The floating bar. Hidden in production builds.

export type PrototypeBarRow = {
  label: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  current: string;
  onSelect: (id: string) => void;
};

export function PrototypeBar({
  variant,
  onVariant,
  rows,
}: {
  variant: PrototypeVariantId;
  onVariant: (variant: PrototypeVariantId) => void;
  rows: PrototypeBarRow[];
}) {
  if (import.meta.env.PROD) {
    return null;
  }

  const index = prototypeVariants.findIndex((option) => option.id === variant);
  const cycle = (step: number) => {
    const next =
      prototypeVariants[
        (index + step + prototypeVariants.length) % prototypeVariants.length
      ];

    if (next) {
      onVariant(next.id);
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 print:hidden">
      <div className="pointer-events-auto flex max-w-4xl flex-col gap-2 rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-muted-foreground">Variante</span>
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            onClick={() => cycle(-1)}
          >
            <ChevronLeft aria-hidden="true" data-icon />
            <span className="sr-only">Variante anterior</span>
          </Button>
          <span className="min-w-56 text-center font-medium">
            {variant} — {prototypeVariants[index]?.label}
          </span>
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            onClick={() => cycle(1)}
          >
            <ChevronRight aria-hidden="true" data-icon />
            <span className="sr-only">Variante siguiente</span>
          </Button>
        </div>
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-muted-foreground">{row.label}</span>
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
          </div>
        ))}
      </div>
    </div>
  );
}

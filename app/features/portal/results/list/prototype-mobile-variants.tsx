// PROTOTYPE — throwaway. Mobile layouts for the portal `Resultados` list, switched
// with `?variant=` on /portal/resultados. A is the table PR #1534 ships; B, C
// and D replace it below `sm` only, and the desktop table stays as it is.
// Rows past the real ones are sample rows (marked "muestra") so density reads.
import { Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { AwardBadge } from "@/components/shared/award-badge";
import { Card } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  allDaysTabValue,
  ScheduleDayTabs,
  useScheduleDayTab,
} from "@/features/program/day-tabs";
import { listProgramDays } from "@/features/program/shared";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { matchesPresentationSearch } from "@/lib/presentations/search";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import type { PortalResultRow } from "./server";

export const prototypeVariants = [
  { key: "A", name: "Tabla recortada (PR actual)" },
  { key: "B", name: "Tarjetas compactas" },
  { key: "C", name: "Lista apilada" },
  { key: "D", name: "Tarjeta con campos" },
] as const;

export type PrototypeVariantKey = (typeof prototypeVariants)[number]["key"];

const sampleNames = [
  "Aurora Boreal",
  "Raíces del Sur con nombre bastante largo",
  "Tango Nuevo",
  "Marea",
  "Fuego Lento",
  "Cuerpos en Tránsito",
];
const sampleAwards = [
  { award: "gold", average: 93.25 },
  { award: "bronze", average: 64.5 },
  { award: "specialMention", average: 52 },
  { award: "silver", average: 84.75 },
  { award: "gold", average: 90 },
  { award: "silver", average: 81.33 },
] as const;

/** The real rows plus six sample ones built off the first, so a phone shows a full list. */
export function withSampleRows(rows: PortalResultRow[]): PortalResultRow[] {
  const base = rows[0];

  if (!base) {
    return rows;
  }

  return [
    ...rows,
    ...sampleNames.map((name, index) => ({
      ...base,
      ...sampleAwards[index],
      choreographyId: `muestra-${index}`,
      disqualified: false,
      levelLabel: index % 2 === 0 ? "Amateur" : null,
      name: `${name} (muestra)`,
      orderNumber: (base.orderNumber ?? 0) + 10 + index * 3,
    })),
  ];
}

export function PrototypeMobileList({
  rows,
  variant,
}: {
  rows: PortalResultRow[];
  variant: Exclude<PrototypeVariantKey, "A">;
}) {
  const days = listProgramDays(rows);
  const tab = useScheduleDayTab(days);
  const [search, setSearch] = useState("");
  const visibleRows = rows
    .filter(
      (row) => tab.value === allDaysTabValue || row.scheduledDate === tab.value,
    )
    .filter((row) =>
      matchesPresentationSearch(search, {
        choreographyNumber: row.choreographyNumber,
        name: row.name,
        orderNumber: row.orderNumber,
      }),
    )
    .sort((a, b) => (a.orderNumber ?? 0) - (b.orderNumber ?? 0));

  return (
    <div className="flex flex-col gap-3">
      <ScheduleDayTabs days={days} tab={tab} />
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Buscar"
          placeholder="Buscar por número o nombre"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </InputGroup>
      {variant === "B" ? <CompactCards rows={visibleRows} /> : null}
      {variant === "C" ? <StackedList rows={visibleRows} /> : null}
      {variant === "D" ? <FieldCards rows={visibleRows} /> : null}
      <p className="text-sm text-muted-foreground">
        {visibleRows.length} de {rows.length} registros
      </p>
    </div>
  );
}

function evaluationPath(row: PortalResultRow) {
  return `/portal/presentaciones/${row.choreographyId}`;
}

function formatAverage(row: PortalResultRow) {
  return row.average === null ? "—" : String(row.average);
}

function competedIn(row: PortalResultRow) {
  return [
    formatPrimaryAndSecondaryValue(row.modalityName, row.submodalityName),
    formatPrimaryAndSecondaryValue(
      row.categoryName,
      formatGroupTypeLabel(row.groupType),
    ),
    row.levelLabel,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** B: one card per result; the name leads, what it competed in under it, the award and average last. */
function CompactCards({ rows }: { rows: PortalResultRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <Card key={row.choreographyId} className="gap-2 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <Link
              to={evaluationPath(row)}
              className="min-w-0 truncate font-medium text-brand"
            >
              {row.name}
            </Link>
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
              N.º {row.orderNumber ?? "—"}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {competedIn(row)}
          </p>
          <div className="flex items-center justify-between gap-3">
            <AwardBadge award={row.award} disqualified={row.disqualified} />
            <span className="text-sm font-medium tabular-nums">
              {formatAverage(row)}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}

/** C: a divided list with no boxes; the number is a column, the result sits right. */
function StackedList({ rows }: { rows: PortalResultRow[] }) {
  return (
    <ul className="divide-y rounded-lg border bg-background">
      {rows.map((row) => (
        <li key={row.choreographyId}>
          <Link
            to={evaluationPath(row)}
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
          >
            <span className="w-7 shrink-0 text-center text-sm font-medium tabular-nums">
              {row.orderNumber ?? ""}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium text-brand">
                {row.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {competedIn(row)}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <AwardBadge award={row.award} disqualified={row.disqualified} />
              <span className="text-xs text-muted-foreground tabular-nums">
                {row.average === null ? "—" : `Promedio ${row.average}`}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** D: a card per result with every column as a labelled field, nothing dropped. */
function FieldCards({ rows }: { rows: PortalResultRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <Card key={row.choreographyId} className="gap-3 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-muted-foreground tabular-nums">
              {row.orderNumber ?? ""}
            </span>
            <Link
              to={evaluationPath(row)}
              className="min-w-0 truncate font-medium text-brand"
            >
              {row.name}
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <Field label="Premio">
              <AwardBadge award={row.award} disqualified={row.disqualified} />
            </Field>
            <Field label="Promedio">
              <span className="tabular-nums">{formatAverage(row)}</span>
            </Field>
            <Field label="Modalidad / Submodalidad">
              {formatPrimaryAndSecondaryValue(
                row.modalityName,
                row.submodalityName,
              )}
            </Field>
            <Field label="Categoría / Tipo de grupo">
              {formatPrimaryAndSecondaryValue(
                row.categoryName,
                formatGroupTypeLabel(row.groupType),
              )}
            </Field>
            <Field label="Nivel">{row.levelLabel ?? "—"}</Field>
          </dl>
        </Card>
      ))}
    </div>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";

import {
  AccessHeader,
  AccessPage,
  PrivateAccessHeader,
} from "@/components/auth/access-ui";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { experienceLevelLabels } from "@/lib/events/experience-levels";
import type { JudgePresentationRow } from "@/lib/judging/judge-list.server";
import {
  judgeScoreStatusLabels,
  type JudgeScoreStatus,
} from "@/lib/judging/judge-status";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import {
  findResumePresentationId,
  readLastOpenedPresentationId,
  rememberOpenedPresentation,
} from "./resume";
import type { JudgePanelRouteData } from "./server";

export type JudgePanelViewProps = {
  loaderData: JudgePanelRouteData;
};

const statusVariants: Record<
  JudgeScoreStatus,
  "default" | "destructive" | "outline" | "secondary"
> = {
  completa: "default",
  descalificada: "destructive",
  pendiente: "outline",
  sinDevolucion: "secondary",
};

/**
 * The judge's whole day on one page. It is read in a dark theatre between two
 * dances, so nothing here is paginated, nothing is hidden behind a filter panel
 * and no row carries a number: the judge is looking for the piece that is about
 * to go on, not comparing scores.
 */
export function JudgePanelView({ loaderData }: JudgePanelViewProps) {
  const [onlyPending, setOnlyPending] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const resumePresentationId = useResumePresentationId(
    loaderData.presentations,
  );
  const rows = onlyPending
    ? loaderData.presentations.filter((row) => row.status === "pendiente")
    : loaderData.presentations;

  useEffect(() => {
    tableRef.current
      ?.querySelector("[data-resume-marker]")
      ?.scrollIntoView({ block: "center" });
  }, [resumePresentationId, onlyPending]);

  return (
    <AccessPage width="xl">
      <PrivateAccessHeader account={loaderData.account} />
      <AccessHeader
        eyebrow="Juzgamiento"
        title="Presentaciones de hoy"
        description="Las presentaciones que tenés asignadas hoy, en el orden del programa."
      />

      <div className="mt-6 flex items-center gap-2">
        <Switch
          id="solo-pendientes"
          aria-label="Solo pendientes"
          checked={onlyPending}
          onCheckedChange={setOnlyPending}
        />
        <Label htmlFor="solo-pendientes">Solo pendientes</Label>
      </div>

      <div className="mt-4" ref={tableRef}>
        <ClientDataTable
          columns={judgePresentationColumns}
          emptyMessage="No tenés presentaciones asignadas para hoy."
          getRowKey={(row) => row.presentationId}
          getRowProps={(row) => ({
            "data-presentation-name": row.name,
            ...(row.presentationId === resumePresentationId
              ? { "data-resume-marker": "true", className: "bg-accent/60" }
              : {}),
          })}
          hidePagination
          hideSearch
          rows={rows}
          searchPlaceholder="Buscar presentación"
        />
      </div>
    </AccessPage>
  );
}

/**
 * The marker is read once, on mount: it says where the judge left off when they
 * came back, and it would be unsettling for it to jump to another row while
 * they are looking at the list.
 */
function useResumePresentationId(presentations: JudgePresentationRow[]) {
  const [lastOpenedPresentationId] = useState(() =>
    typeof window === "undefined" ? null : readLastOpenedPresentationId(),
  );

  return useMemo(
    () => findResumePresentationId(presentations, lastOpenedPresentationId),
    [lastOpenedPresentationId, presentations],
  );
}

function formatExperienceLevel(row: JudgePresentationRow) {
  if (!row.categoryAdmitsExperienceLevels) {
    return "No aplica";
  }

  if (!row.experienceLevel) {
    return "—";
  }

  return experienceLevelLabels[row.experienceLevel] ?? row.experienceLevel;
}

const judgePresentationColumns: DataTableColumn<JudgePresentationRow>[] = [
  {
    id: "orden",
    header: "N°",
    cell: (row) => row.orderNumber,
    leading: true,
    className: "tabular-nums",
  },
  {
    id: "nombre",
    header: "Nombre",
    cell: (row) => (
      <DataTableLink
        to={`?presentacion=${row.presentationId}`}
        onClick={() => rememberOpenedPresentation(row.presentationId)}
      >
        {row.name}
      </DataTableLink>
    ),
  },
  {
    id: "categoria",
    header: "Categoría",
    cell: (row) =>
      formatPrimaryAndSecondaryValue(
        row.categoryName,
        formatGroupTypeLabel(row.groupType),
      ),
  },
  {
    id: "nivel",
    header: "Nivel",
    cell: formatExperienceLevel,
  },
  {
    id: "modalidad",
    header: "Modalidad",
    cell: (row) =>
      formatPrimaryAndSecondaryValue(row.modalityName, row.submodalityName),
  },
  {
    id: "estado",
    header: "Estado",
    cell: (row) => (
      <Badge variant={statusVariants[row.status]}>
        {judgeScoreStatusLabels[row.status]}
      </Badge>
    ),
  },
];

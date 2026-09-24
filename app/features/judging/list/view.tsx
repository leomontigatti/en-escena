import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

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
import type { JudgePanelActionData } from "@/features/judging/score/action.server";
import { JudgeScoreDialog } from "@/features/judging/score/dialog";
import { experienceLevelLabels } from "@/lib/events/experience-levels";
import type { JudgePresentationRow } from "@/lib/judging/judge-list.server";
import {
  judgeScoreStatusLabels,
  type JudgeScoreStatus,
} from "@/lib/judging/judge-status";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";
import { showToastMessage } from "@/lib/shared/toasts";

import {
  findResumePresentationId,
  readLastOpenedPresentationId,
  rememberOpenedPresentation,
} from "./resume";
import type { JudgePanelRouteData } from "./server";

export type JudgePanelViewProps = {
  actionData?: JudgePanelActionData;
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
export function JudgePanelView({
  actionData,
  loaderData,
}: JudgePanelViewProps) {
  const [onlyPending, setOnlyPending] = useState(false);
  const { openPresentation, openPresentationId, setOpenPresentationId } =
    useOpenPresentation(loaderData.presentations);
  const tableRef = useRef<HTMLDivElement>(null);
  const resumePresentationId = useResumePresentationId(
    loaderData.presentations,
  );
  const rows = onlyPending
    ? loaderData.presentations.filter((row) => row.status === "pendiente")
    : loaderData.presentations;

  useJudgeScoreFeedback({
    actionData,
    openPresentationId,
    presentations: loaderData.presentations,
    setOpenPresentationId,
  });

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

      {openPresentation && openPresentation.criteria.length === 0 ? (
        <JudgeScoreDialog
          fieldErrors={actionData?.fieldErrors}
          key={openPresentation.presentationId}
          onOpenChange={(open) => {
            if (!open) {
              setOpenPresentationId(null);
            }
          }}
          presentation={openPresentation}
        />
      ) : null}
    </AccessPage>
  );
}

/**
 * Which presentation the judge has open, kept in the URL so that coming back to
 * the tab, or a revalidation mid-show, reopens what they were looking at.
 */
function useOpenPresentation(presentations: JudgePresentationRow[]) {
  const [searchParams, setSearchParams] = useSearchParams();
  const openPresentationId = searchParams.get("presentacion");
  const setOpenPresentationId = useCallback(
    (presentationId: string | null) => {
      setSearchParams(
        (params) => {
          if (presentationId === null) {
            params.delete("presentacion");
          } else {
            params.set("presentacion", presentationId);
          }

          return params;
        },
        { preventScrollReset: true, replace: true },
      );
    },
    [setSearchParams],
  );

  return {
    openPresentation:
      presentations.find((row) => row.presentationId === openPresentationId) ??
      null,
    openPresentationId,
    setOpenPresentationId,
  };
}

const allPresentationsScoredMessage =
  "Puntuaste todas las presentaciones de hoy.";

/**
 * What happens once the save has answered. A judge keeps pace with the stage,
 * so a saved score opens the next one they still owe — read from the list the
 * save revalidated, never from what was on screen when they tapped — and only
 * when nothing is left does the form close.
 *
 * A refusal keeps the form exactly as it was: there is no offline mode, so the
 * score on screen is the only copy of it and the judge retries with it.
 */
function useJudgeScoreFeedback({
  actionData,
  openPresentationId,
  presentations,
  setOpenPresentationId,
}: {
  actionData?: JudgePanelActionData;
  openPresentationId: string | null;
  presentations: JudgePresentationRow[];
  setOpenPresentationId: (presentationId: string | null) => void;
}) {
  const answered = useRef<JudgePanelActionData | null>(null);

  useEffect(() => {
    if (!actionData || answered.current === actionData) {
      return;
    }

    answered.current = actionData;

    if (actionData.status === "error") {
      showToastMessage({
        id: judgeScoreToastId,
        message: actionData.message,
        variant: "error",
      });

      return;
    }

    const nextPresentationId = findResumePresentationId(
      presentations,
      openPresentationId,
    );

    if (nextPresentationId === null) {
      setOpenPresentationId(null);
      showToastMessage({
        id: judgeScoreToastId,
        message: allPresentationsScoredMessage,
        variant: "success",
      });

      return;
    }

    rememberOpenedPresentation(nextPresentationId);
    setOpenPresentationId(nextPresentationId);
    showToastMessage({
      id: judgeScoreToastId,
      message: actionData.message,
      variant: "success",
    });
  }, [actionData, openPresentationId, presentations, setOpenPresentationId]);
}

const judgeScoreToastId = "juzgamiento-puntaje";

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

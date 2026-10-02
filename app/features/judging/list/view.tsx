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
import { DataTableTruncatedText } from "@/components/shared/data-table-truncated-text";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { JudgePanelActionData } from "@/features/judging/score/action.server";
import { JudgeScoreDialog } from "@/features/judging/score/dialog";
import { JudgeScoreSheet } from "@/features/judging/score/sheet";
import { formatScheduleDayHeading } from "@/lib/choreographies/schedule-formatters";
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
  complete: "default",
  disqualified: "destructive",
  noFeedback: "secondary",
  pending: "outline",
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
    ? loaderData.presentations.filter((row) => row.status === "pending")
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

  // A sheet takes the whole page rather than sitting over the list: it is
  // longer than a dialog can hold, and the judge filling it has no use for the
  // rest of the day behind it.
  if (openPresentation && openPresentation.criteria.length > 0) {
    return (
      <JudgeScoreSheet
        account={loaderData.account}
        actionData={actionData}
        judgingDate={loaderData.judgingDate}
        key={openPresentation.presentationId}
        onClose={() => setOpenPresentationId(null)}
        presentation={openPresentation}
      />
    );
  }

  return (
    <AccessPage width="2xl">
      <PrivateAccessHeader account={loaderData.account} />
      <AccessHeader
        eyebrow={formatScheduleDayHeading(loaderData.judgingDate)}
        title="Presentaciones de hoy"
        titleLevel={2}
        action={
          <div className="flex items-center gap-2">
            <Switch
              id="solo-pendientes"
              aria-label="Solo pendientes"
              checked={onlyPending}
              onCheckedChange={setOnlyPending}
            />
            <Label htmlFor="solo-pendientes">Solo pendientes</Label>
          </div>
        }
        description="Las presentaciones que tenés asignadas hoy, en el orden del programa."
      />

      <div className="mt-6" ref={tableRef}>
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
          layout="fit"
          rows={rows}
          searchPlaceholder="Buscar presentación"
        />
      </div>

      {openPresentation && openPresentation.criteria.length === 0 ? (
        <JudgeScoreDialog
          fieldErrors={actionData?.fieldErrors}
          key={openPresentation.presentationId}
          onClose={() => setOpenPresentationId(null)}
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

// The admin's presentation list, column for column and muted the same way,
// with the number's share moved to the level so `Profesional` fits the
// narrower card. Laid out `fit`: four free-text columns share the row, so each keeps its share
// and a long academy or name is cut rather than pushing `Estado` off the card.
const judgePresentationColumns: DataTableColumn<JudgePresentationRow>[] = [
  {
    id: "orden",
    header: "N.º",
    cell: (row) => row.orderNumber,
    leading: true,
    className: "font-medium tabular-nums",
    width: 6,
  },
  {
    id: "nombre",
    header: "Nombre",
    className: "font-medium",
    cell: (row) => (
      <DataTableTruncatedText value={row.name}>
        <DataTableLink
          to={`?presentacion=${row.presentationId}`}
          onClick={() => rememberOpenedPresentation(row.presentationId)}
        >
          {row.name}
        </DataTableLink>
      </DataTableTruncatedText>
    ),
    width: 14,
  },
  {
    id: "academia",
    header: "Academia",
    className: "text-muted-foreground",
    cell: (row) => <DataTableTruncatedText value={row.academyName} />,
    width: 13,
  },
  {
    id: "modalidadSubmodalidad",
    header: "Modalidad / Submodalidad",
    className: "text-muted-foreground",
    cell: (row) => (
      <DataTableTruncatedText
        value={formatPrimaryAndSecondaryValue(
          row.modalityName,
          row.submodalityName,
        )}
      />
    ),
    width: 21,
  },
  {
    id: "categoriaTipoGrupo",
    header: "Categoría / Tipo de grupo",
    className: "text-muted-foreground",
    cell: (row) => (
      <DataTableTruncatedText
        value={formatPrimaryAndSecondaryValue(
          row.categoryName,
          formatGroupTypeLabel(row.groupType),
        )}
      />
    ),
    width: 20,
  },
  {
    id: "nivel",
    header: "Nivel",
    className: "text-muted-foreground",
    cell: (row) => (
      <DataTableTruncatedText value={formatExperienceLevel(row)} />
    ),
    width: 10,
  },
  {
    id: "estado",
    header: "Estado",
    cell: (row) => (
      <Badge variant={statusVariants[row.status]}>
        {judgeScoreStatusLabels[row.status]}
      </Badge>
    ),
    width: 11,
  },
];

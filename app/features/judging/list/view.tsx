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
import { DataTableFilters } from "@/components/shared/data-table-filters";
import type { DataTableFacetedFilter } from "@/components/shared/data-table.shared";
import { DataTableLink } from "@/components/shared/data-table-link";
import { DataTableTruncatedText } from "@/components/shared/data-table-truncated-text";
import { Badge } from "@/components/ui/badge";
import type { JudgePanelActionData } from "@/features/judging/score/action.server";
import { JudgeScoreDialog } from "@/features/judging/score/dialog";
import { JudgeScoreSheet } from "@/features/judging/score/sheet";
import { formatScheduleDayHeading } from "@/lib/choreographies/schedule-formatters";
import { experienceLevelLabels } from "@/lib/events/experience-levels";
import type { JudgePresentationRow } from "@/lib/judging/judge-list.server";
import { judgeScoreStatusBadge } from "@/lib/judging/judge-status";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";
import { showToastMessage } from "@/lib/shared/toasts";
import { dayTabParam, useUrlTab } from "@/lib/shared/url-tab";

import {
  findResumeMarkerPresentationId,
  findResumePresentationId,
  readLastOpenedPresentationId,
  rememberOpenedPresentation,
} from "./resume";
import type { JudgePanelRouteData } from "./server";

export type JudgePanelViewProps = {
  actionData?: JudgePanelActionData;
  loaderData: JudgePanelRouteData;
};

/**
 * The judge's whole day on one page. It is read in a dark theatre between two
 * dances, so nothing here is paginated: the judge is looking for the piece that
 * is about to go on. The only number a row carries is the judge's own score,
 * and the only control above the list is its filter button.
 *
 * A judge with presentations on other days can switch to one of them to look
 * back at what they scored or ahead at what is coming. Only the judging day is
 * open: on any other one the rows lead nowhere, and nothing opens the score
 * form, a `?presentacion=` URL included.
 */
export function JudgePanelView({
  actionData,
  loaderData,
}: JudgePanelViewProps) {
  const [onlyPending, setOnlyPending] = useState(false);
  const { isOpen } = loaderData;
  const { openPresentation, openPresentationId, setOpenPresentationId } =
    useOpenPresentation(loaderData.presentations, isOpen);
  const tableRef = useRef<HTMLDivElement>(null);
  const resumePresentationId = useResumePresentationId(
    loaderData.presentations,
    isOpen,
  );
  const columns = useMemo(
    () => buildJudgePresentationColumns(isOpen),
    [isOpen],
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
        judgingDate={loaderData.day}
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
        eyebrow={formatScheduleDayHeading(loaderData.day)}
        title={isOpen ? "Presentaciones de hoy" : "Presentaciones del día"}
        titleLevel={2}
        description={describeDay(loaderData)}
        descriptionAction={
          <JudgeListFilters
            loaderData={loaderData}
            onlyPending={onlyPending}
            onOnlyPendingChange={setOnlyPending}
          />
        }
      />

      <div className="mt-6 flex flex-col gap-4" ref={tableRef}>
        <ClientDataTable
          columns={columns}
          emptyMessage={
            isOpen
              ? "No tenés presentaciones asignadas para hoy."
              : "No tenés presentaciones asignadas para este día."
          }
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
          key={openPresentation.presentationId}
          onClose={() => setOpenPresentationId(null)}
          presentation={openPresentation}
        />
      ) : null}
    </AccessPage>
  );
}

function describeDay({
  day,
  isOpen,
  judgingDate,
}: Pick<JudgePanelRouteData, "day" | "isOpen" | "judgingDate">) {
  if (isOpen) {
    return "Las presentaciones que tenés asignadas hoy, en el orden del programa.";
  }

  return day < judgingDate
    ? "Las presentaciones que tenés asignadas ese día. La jornada ya cerró: podés ver tus puntajes, pero no cambiarlos."
    : "Las presentaciones que tenés asignadas ese día, en el orden del programa. Vas a poder puntuarlas cuando empiece la jornada.";
}

const dayFilterGroupId = dayTabParam;
const statusFilterGroupId = "estado";
const pendingFilterValue = "pendientes";

/**
 * The list's one filter button, on the line of the header's description. It always offers `Estado`, which hides what the judge already scored and
 * is held in the page's own state, and offers `Día` only to a judge with
 * another day to switch to.
 *
 * The day is kept in the URL the way a day tab is. The judging day is the
 * list's default, so it is never shown as applied: picking it, or removing the
 * filter, drops the day from the URL. A presentation left open belongs to the
 * day being left, so it is dropped with it.
 */
function JudgeListFilters({
  loaderData,
  onlyPending,
  onOnlyPendingChange,
}: {
  loaderData: JudgePanelRouteData;
  onlyPending: boolean;
  onOnlyPendingChange: (onlyPending: boolean) => void;
}) {
  const { dayOptions, judgingDate } = loaderData;
  const { onValueChange, value } = useUrlTab({
    defaultValue: judgingDate,
    param: dayTabParam,
    resets: ["presentacion"],
    values: dayOptions,
  });
  const dayGroup: DataTableFacetedFilter = {
    id: dayFilterGroupId,
    label: "Día",
    options: dayOptions.map((option) => ({
      label:
        option === judgingDate
          ? `${formatScheduleDayHeading(option)} (hoy)`
          : formatScheduleDayHeading(option),
      value: option,
    })),
  };
  const statusGroup: DataTableFacetedFilter = {
    id: statusFilterGroupId,
    label: "Estado",
    options: [{ label: "Pendientes", value: pendingFilterValue }],
    renderValue: (option) => <Badge variant="outline">{option.label}</Badge>,
  };

  return (
    // Never narrower than its filters: the description beside it wraps onto
    // another line before an applied filter and the add button come apart.
    <div className="flex flex-wrap items-center justify-end gap-2 lg:shrink-0 lg:flex-nowrap">
      <DataTableFilters
        groups={dayOptions.length > 0 ? [dayGroup, statusGroup] : [statusGroup]}
        selectedValues={{
          ...(value === judgingDate ? {} : { [dayFilterGroupId]: value }),
          ...(onlyPending ? { [statusFilterGroupId]: pendingFilterValue } : {}),
        }}
        onChange={(values) => {
          const nextOnlyPending =
            values[statusFilterGroupId] === pendingFilterValue;
          const nextDay = values[dayFilterGroupId] || judgingDate;

          if (nextOnlyPending !== onlyPending) {
            onOnlyPendingChange(nextOnlyPending);
          }

          if (nextDay !== value) {
            onValueChange(nextDay);
          }
        }}
      />
    </div>
  );
}

/**
 * Which presentation the judge has open, kept in the URL so that coming back to
 * the tab, or a revalidation mid-show, reopens what they were looking at. On a
 * day that is not open nothing opens, whatever the URL says.
 */
function useOpenPresentation(
  presentations: JudgePresentationRow[],
  isOpen: boolean,
) {
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
    openPresentation: isOpen
      ? (presentations.find(
          (row) => row.presentationId === openPresentationId,
        ) ?? null)
      : null,
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
 * they are looking at the list. It belongs to the show running now, so another
 * day has none.
 */
function useResumePresentationId(
  presentations: JudgePresentationRow[],
  isOpen: boolean,
) {
  const [lastOpenedPresentationId] = useState(() =>
    typeof window === "undefined" ? null : readLastOpenedPresentationId(),
  );

  return useMemo(
    () =>
      findResumeMarkerPresentationId(
        presentations,
        lastOpenedPresentationId,
        isOpen,
      ),
    [isOpen, lastOpenedPresentationId, presentations],
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
// On a day that is not open the name is plain text: there is no form to open.
function buildJudgePresentationColumns(
  isOpen: boolean,
): DataTableColumn<JudgePresentationRow>[] {
  return [
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
      cell: (row) =>
        isOpen ? (
          <DataTableTruncatedText value={row.name}>
            <DataTableLink
              to={`?presentacion=${row.presentationId}`}
              onClick={() => rememberOpenedPresentation(row.presentationId)}
            >
              {row.name}
            </DataTableLink>
          </DataTableTruncatedText>
        ) : (
          <DataTableTruncatedText value={row.name} />
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
      cell: (row) => {
        const badge = judgeScoreStatusBadge({ ...row, isOpen });

        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
      width: 11,
    },
  ];
}

import { Info, ListOrdered, TriangleAlert } from "lucide-react";
import { useSearchParams } from "react-router";

import { AlertStack } from "@/components/shared/alert-stack";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { listQueryParamNames } from "@/lib/list-query/list-query";
import {
  ScheduleDayTabs,
  useScheduleDayTab,
} from "@/features/program/day-tabs";

import type { PresentationListResult } from "./shared";

/**
 * Everything the participation list says around its table: the notices above
 * it and the day tabs that narrow it. Neither touches a row, which is why they
 * live apart from the columns and the moving seam.
 */

export function PresentationNotices({
  loaderData,
  needsNumberSortToDrag,
  onOrderAutomatically,
}: {
  loaderData: PresentationListResult;
  needsNumberSortToDrag: boolean;
  onOrderAutomatically: () => void;
}) {
  return (
    <AlertStack>
      {loaderData.hasPresentations ? null : (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertTitle>Sin números de presentación</AlertTitle>
          <AlertDescription>
            Las coreografías todavía no tienen un número de presentación
            asignado.
          </AlertDescription>
          {loaderData.canOrder ? (
            <AlertAction className="top-1/2 -translate-y-1/2">
              <Button
                type="button"
                size="sm"
                variant="link"
                onClick={onOrderAutomatically}
              >
                <ListOrdered aria-hidden="true" data-icon="inline-start" />
                Ordenar automáticamente
              </Button>
            </AlertAction>
          ) : null}
        </Alert>
      )}
      {loaderData.hasPresentations && loaderData.unorderedCount > 0 ? (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertTitle>Numeración incompleta</AlertTitle>
          <AlertDescription>
            {loaderData.unorderedCount === 1
              ? "Existe 1 coreografía sin número de presentación."
              : `Existen ${loaderData.unorderedCount} coreografías sin número de presentación.`}
          </AlertDescription>
        </Alert>
      ) : null}
      {needsNumberSortToDrag ? (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertTitle>Arrastre desactivado</AlertTitle>
          <AlertDescription>Ordená por número para arrastrar.</AlertDescription>
        </Alert>
      ) : null}
      {loaderData.warnedCount > 0 ? (
        <PresentationWarningsNotice loaderData={loaderData} />
      ) : null}
    </AlertStack>
  );
}

/** The warnings count, and the filter that narrows the list down to them. */
function PresentationWarningsNotice({
  loaderData,
}: {
  loaderData: PresentationListResult;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isFilteredToWarnings = loaderData.filters.warnings === "con";

  const toggleWarningFilter = () => {
    const next = new URLSearchParams(searchParams);

    if (isFilteredToWarnings) {
      next.delete("advertencias");
    } else {
      next.set("advertencias", "con");
    }

    next.delete(listQueryParamNames.page);
    setSearchParams(next);
  };

  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Presentaciones con advertencias</AlertTitle>
      <AlertDescription>
        {loaderData.warnedCount === 1
          ? "Existe 1 presentación con advertencias."
          : `Existen ${loaderData.warnedCount} presentaciones con advertencias.`}
      </AlertDescription>
      <AlertAction className="top-1/2 -translate-y-1/2">
        <Button
          type="button"
          size="sm"
          variant="link"
          onClick={toggleWarningFilter}
        >
          {isFilteredToWarnings ? "Ver todas" : "Ver"}
        </Button>
      </AlertAction>
    </Alert>
  );
}

export function PresentationDayTabs({
  loaderData,
}: {
  loaderData: PresentationListResult;
}) {
  const tab = useScheduleDayTab(loaderData.days);

  return <ScheduleDayTabs days={loaderData.days} tab={tab} />;
}

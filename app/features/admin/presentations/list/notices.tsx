import { AlertTriangle, Info, ListOrdered } from "lucide-react";
import { useSearchParams } from "react-router";

import { AlertStack } from "@/components/shared/alert-stack";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatScheduleDayLabel } from "@/lib/choreographies/schedule-formatters";

import {
  orderAutomaticallyIntent,
  type PresentationListResult,
} from "./shared";

/**
 * Everything the participation list says around its table: the notices above
 * it, the day tabs that narrow it and the confirmation the one destructive
 * action opens. None of them touches a row, which is why they live apart from
 * the columns and the moving seam.
 */

const allDaysTabValue = "todos";

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

    next.delete("pagina");
    setSearchParams(next);
  };

  return (
    <Alert variant="warning">
      <AlertTriangle aria-hidden="true" />
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
  const [searchParams, setSearchParams] = useSearchParams();

  const selectDay = (day: string) => {
    const next = new URLSearchParams(searchParams);

    if (day === allDaysTabValue) {
      next.delete("dia");
    } else {
      next.set("dia", day);
    }

    next.delete("pagina");
    setSearchParams(next);
  };

  return (
    <Tabs value={loaderData.filters.day ?? allDaysTabValue}>
      <TabsList variant="line">
        <TabsTrigger
          value={allDaysTabValue}
          onClick={() => selectDay(allDaysTabValue)}
        >
          Todos
        </TabsTrigger>
        {loaderData.days.map((day) => (
          <TabsTrigger key={day} value={day} onClick={() => selectDay(day)}>
            {formatScheduleDayLabel(day)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/**
 * On the `delete-dialog.tsx` shape: the description, one always-shown
 * destructive alert and the confirmation. The action is never disabled by the
 * data — what cannot be ordered is answered by the server, not by the menu.
 */
export function OrderingConfirmationDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-h-[calc(100dvh-2rem)]"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Ordenar automáticamente</AlertDialogTitle>
          <AlertDialogDescription>
            Las coreografías elegibles se ordenan por defecto y se les asigna un
            número de presentación nuevo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            Esta acción es irreversible y modifica cualquier orden manual
            realizado.
          </AlertDescription>
        </Alert>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <form method="post">
            <input
              type="hidden"
              name="intent"
              value={orderAutomaticallyIntent}
            />
            <Button type="submit">Ordenar</Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

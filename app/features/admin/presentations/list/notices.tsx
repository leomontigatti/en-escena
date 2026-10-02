import { Info, ListOrdered, TriangleAlert } from "lucide-react";
import { Form, useSearchParams } from "react-router";

import { AlertStack } from "@/components/shared/alert-stack";
import { IrreversibleActionAlert } from "@/components/shared/irreversible-action-alert";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import {
  isRouteFormPending,
  useCloseOnceSettled,
  useOptionalNavigation,
} from "@/lib/shared/forms";
import { listQueryParamNames } from "@/lib/list-query/list-query";
import {
  ScheduleDayTabs,
  useScheduleDayTab,
} from "@/features/program/day-tabs";

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

/**
 * On the `delete-dialog.tsx` shape: the description, one always-shown
 * destructive alert and the confirmation. The action is never disabled by the
 * data — what cannot be ordered is answered by the server, not by the menu.
 */
export function OrderingConfirmationDialog({
  frozenCount,
  onOpenChange,
  open,
}: {
  /** The presentations the ordering will leave in place, named up front. */
  frozenCount: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, {
    intent: orderAutomaticallyIntent,
  });
  // The ordering stays on the list, so nothing navigates the dialog away: a
  // second `Confirmar` would throw away the manual moves the first one just made.
  useCloseOnceSettled({ isPending, onClose: () => onOpenChange(false) });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-h-[calc(100dvh-2rem)] sm:max-w-lg"
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
        {frozenCount > 0 ? (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertTitle>Presentaciones fijas</AlertTitle>
            <AlertDescription>
              Las presentaciones de un cronograma ya evaluado no cambian de
              número.
            </AlertDescription>
          </Alert>
        ) : null}
        <IrreversibleActionAlert>
          Esta acción es irreversible y modifica cualquier orden manual
          realizado.
        </IrreversibleActionAlert>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <Form method="post">
            <input
              type="hidden"
              name="intent"
              value={orderAutomaticallyIntent}
            />
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : null}
              Confirmar
            </Button>
          </Form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

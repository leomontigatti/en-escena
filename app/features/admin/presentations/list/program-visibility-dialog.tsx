import { Form } from "react-router";

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

import {
  programEventIdFieldName,
  programVisibleFieldName,
  setProgramVisibilityIntent,
} from "./shared";

/**
 * The confirmation before the program is shown or hidden. The form carries the
 * event it was opened for, which the action checks is still the active one.
 */
export function ProgramVisibilityDialog({
  eventId,
  onClose,
  show,
}: {
  eventId: string;
  onClose: () => void;
  show: boolean;
}) {
  const isPending = isRouteFormPending(useOptionalNavigation(), {
    intent: setProgramVisibilityIntent,
  });

  useCloseOnceSettled({ isPending, onClose });

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {show ? "¿Mostrar programa?" : "¿Ocultar programa?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {show
              ? "El programa se muestra públicamente y puede verse entrando al enlace o usando el código QR. Podés volver a ocultarlo cuando quieras."
              : "El programa deja de verse públicamente hasta que vuelva a mostrarse."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <Form method="post">
            <input
              type="hidden"
              name="intent"
              value={setProgramVisibilityIntent}
            />
            <input
              type="hidden"
              name={programEventIdFieldName}
              value={eventId}
            />
            <input
              type="hidden"
              name={programVisibleFieldName}
              value={String(show)}
            />
            <Button
              type="submit"
              disabled={isPending}
              variant={show ? "default" : "destructive"}
            >
              {isPending ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : null}
              {show ? "Mostrar programa" : "Ocultar programa"}
            </Button>
          </Form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

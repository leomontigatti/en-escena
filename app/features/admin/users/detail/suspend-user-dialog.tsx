import { AlertCircleIcon, UserX } from "lucide-react";
import { Form } from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { isRouteFormPending, useOptionalNavigation } from "@/lib/shared/forms";

const suspendUserIntent = "suspend-user";

/**
 * The confirmation in front of `Suspender usuario`. Shaped like the shared
 * withdraw dialog — a destructive gesture that keeps what the user did — but
 * dedicated: suspension posts the bare intent the detail route already answers,
 * with no record id and no confirmation field, and it posts it through the
 * router `Form` the menu item used, so the confirmation shows a pending state.
 */
export function SuspendUserDialog({
  open,
  onOpenChange,
  userName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
}) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, {
    intent: suspendUserIntent,
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>¿Suspender a {userName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se cierran sus sesiones y no podrá ingresar hasta que lo reactives.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Alert variant="warning">
          <AlertCircleIcon aria-hidden="true" />
          <AlertDescription>
            Conserva su historial y sus asignaciones de juez.
          </AlertDescription>
        </Alert>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <Form method="post">
            <input type="hidden" name="intent" value={suspendUserIntent} />
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? (
                <Spinner aria-hidden="true" data-icon />
              ) : (
                <UserX aria-hidden="true" data-icon="inline-start" />
              )}
              Suspender
            </Button>
          </Form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

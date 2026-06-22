import { Trash2 } from "lucide-react";

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
import { deleteChoreographyIntent } from "@/lib/portal/coreografia-detail.shared";

export function DeleteChoreographyDialog({
  choreographyId,
  isOpen,
  onOpenChange,
  warningMessage,
}: {
  choreographyId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  warningMessage: string | null;
}) {
  return (
    <>
      {isOpen ? (
        <div className="sr-only">
          <p>¿Eliminar Coreografía?</p>
          <p>
            En esta versión la eliminación es definitiva y libera el cupo del
            Cupo de cronograma.
          </p>
          {warningMessage ? <p>{warningMessage}</p> : null}
          <input type="hidden" name="intent" value={deleteChoreographyIntent} />
        </div>
      ) : null}
      <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
        {isOpen ? (
          <AlertDialogContent
            forceMount
            className="w-[calc(100%-2rem)] max-w-lg gap-4 p-6 sm:max-w-lg"
          >
            <AlertDialogHeader className="flex flex-col items-start gap-1.5 text-left">
              <AlertDialogTitle>¿Eliminar Coreografía?</AlertDialogTitle>
              <AlertDialogDescription>
                En esta versión la eliminación es definitiva y libera el cupo
                del Cupo de cronograma.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {warningMessage ? (
              <p className="rounded-lg bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground">
                {warningMessage}
              </p>
            ) : null}
            <AlertDialogFooter className="m-0 rounded-none border-0 bg-transparent p-0">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value={deleteChoreographyIntent}
                />
                <input
                  type="hidden"
                  name="confirmDeletion"
                  value={choreographyId}
                />
                <Button type="submit" variant="destructive">
                  <Trash2 aria-hidden="true" data-icon="inline-start" />
                  Eliminar Coreografía
                </Button>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </>
  );
}

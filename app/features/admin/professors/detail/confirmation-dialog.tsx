import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  getProfessorDialogFormId,
  type ProfessorConfirmationAction,
  type ProfessorDialogIntent,
  type ProfessorEditFormValues,
} from "./shared";

export function ProfessorConfirmationDialog({
  action,
  intent,
  onOpenChange,
  pendingUpdateValues,
}: {
  action: ProfessorConfirmationAction;
  intent: ProfessorDialogIntent | null;
  onOpenChange: (open: boolean) => void;
  pendingUpdateValues: ProfessorEditFormValues | null;
}) {
  const isOpen = intent !== null;
  const formId = getProfessorDialogFormId(intent);
  const isUpdateIntent = intent === "update-professor";
  const canSubmitUpdate = !isUpdateIntent || pendingUpdateValues !== null;
  const pendingUpdateFields = isUpdateIntent ? pendingUpdateValues : null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      {intent ? (
        <AlertDialogContent forceMount size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{action.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {action.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form id={formId} method="post" noValidate className="grid gap-4">
            <input type="hidden" name="intent" value={action.intent} />
            {pendingUpdateFields ? (
              <>
                <input
                  type="hidden"
                  name="firstName"
                  value={pendingUpdateFields.firstName}
                />
                <input
                  type="hidden"
                  name="lastName"
                  value={pendingUpdateFields.lastName}
                />
                <input
                  type="hidden"
                  name="documentType"
                  value={pendingUpdateFields.documentType}
                />
                <input
                  type="hidden"
                  name="documentNumber"
                  value={pendingUpdateFields.documentNumber}
                />
              </>
            ) : null}
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction asChild variant={action.variant}>
              <Button form={formId} type="submit" disabled={!canSubmitUpdate}>
                {action.confirmLabel}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}

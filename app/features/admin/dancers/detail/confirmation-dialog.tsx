import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";

import {
  DancerCorrectionReasonField,
  type DancerEditFormController,
  type DancerStatusFormController,
} from "./form";
import type {
  DancerDialogIntent,
  DancerEditFormValues,
  DancerStatusAction,
} from "./shared";

export function DancerConfirmationDialog({
  birthDateMayNeedRecalculation,
  correctionReasonRequired,
  dialogIntent,
  editForm,
  editFormId,
  onOpenChange,
  statusAction,
  statusForm,
  statusFormId,
  verifyFormId,
}: {
  birthDateMayNeedRecalculation: boolean;
  correctionReasonRequired: boolean;
  dialogIntent: DancerDialogIntent | null;
  editForm: DancerEditFormController;
  editFormId: string;
  onOpenChange: (open: boolean) => void;
  statusAction: DancerStatusAction;
  statusForm: DancerStatusFormController;
  statusFormId: string;
  verifyFormId: string;
}) {
  return (
    <>
      <AlertDialog open={dialogIntent === "save"} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar cambios?</AlertDialogTitle>
            {correctionReasonRequired ? (
              <AlertDialogDescription>
                Este bailarín requiere un motivo de corrección para guardar los
                cambios.
              </AlertDialogDescription>
            ) : (
              <AlertDialogDescription>
                Confirmá los cambios antes de guardarlos.
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          {birthDateMayNeedRecalculation ? (
            <Alert variant="warning">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>
                Si cambiás la fecha de nacimiento, las coreografías vinculadas
                pueden requerir recalcular categoría desde el flujo de
                Coreografías.
              </AlertDescription>
            </Alert>
          ) : null}
          {correctionReasonRequired ? (
            <DancerCorrectionReasonField
              form={editForm.form}
              formId={editFormId}
              required={true}
            />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button type="submit" form={editFormId}>
                Guardar
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dialogIntent === statusAction.intent}
        onOpenChange={onOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {getStatusDialogTitle(statusAction.intent)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusAction.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            id={statusFormId}
            method="post"
            noValidate
            onSubmit={statusForm.handleSubmit}
          >
            <input type="hidden" name="intent" value={statusAction.intent} />
            {correctionReasonRequired ? (
              <DancerCorrectionReasonField
                form={statusForm.form}
                formId={statusFormId}
                required={true}
              />
            ) : null}
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              asChild
              variant={getStatusDialogVariant(statusAction.intent)}
            >
              <Button type="submit" form={statusFormId}>
                {statusAction.label}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialogIntent === "verify"} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Verificar?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirmá la verificación administrativa de la identidad de este
              bailarín.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form id={verifyFormId} method="post">
            <input type="hidden" name="intent" value="verify-dancer-identity" />
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button type="submit" form={verifyFormId}>
                Verificar
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function getStatusDialogTitle(intent: DancerStatusAction["intent"]) {
  switch (intent) {
    case "archive-dancer":
      return "¿Archivar bailarín?";
    case "reactivate-dancer":
      return "¿Reactivar bailarín?";
  }
}

function getStatusDialogVariant(intent: DancerStatusAction["intent"]) {
  switch (intent) {
    case "archive-dancer":
      return "destructive";
    case "reactivate-dancer":
      return "default";
  }
}

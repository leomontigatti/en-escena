import { TriangleAlert } from "lucide-react";
import { Form } from "react-router";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  getSaveConsequenceMessage,
  type DancerDialogIntent,
  type DancerEditConsequence,
  type DancerStatusAction,
} from "./shared";

export function DancerConfirmationDialog({
  birthDateMayNeedRecalculation,
  dialogIntent,
  editConsequence,
  onConfirmSave,
  onOpenChange,
  statusAction,
  statusFormId,
  verifyFormId,
}: {
  birthDateMayNeedRecalculation: boolean;
  dialogIntent: DancerDialogIntent | null;
  editConsequence: DancerEditConsequence;
  /** Submits the edit form, past its own question. */
  onConfirmSave: () => void;
  onOpenChange: (open: boolean) => void;
  statusAction: DancerStatusAction;
  statusFormId: string;
  verifyFormId: string;
}) {
  const saveConsequenceMessage = getSaveConsequenceMessage(editConsequence);

  return (
    <>
      <AlertDialog open={dialogIntent === "save"} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              {saveConsequenceMessage ??
                "Confirmá los cambios antes de guardarlos."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {birthDateMayNeedRecalculation ? (
            <Alert variant="warning">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Revisá las categorías</AlertTitle>
              <AlertDescription>
                Si cambiás la fecha de nacimiento, las coreografías vinculadas
                pueden requerir recalcular categoría desde el flujo de
                Coreografías.
              </AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button type="button" onClick={onConfirmSave}>
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
          <Form id={statusFormId} method="post">
            <input type="hidden" name="intent" value={statusAction.intent} />
          </Form>
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
          <Form id={verifyFormId} method="post">
            <input type="hidden" name="intent" value="verify-dancer-identity" />
          </Form>
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

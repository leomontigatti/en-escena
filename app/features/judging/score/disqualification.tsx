import { useState } from "react";
import { AlertCircleIcon } from "lucide-react";

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
import { useOptionalFormAction, useOptionalSubmit } from "@/lib/shared/forms";

/**
 * How a judge closes a presentation for the whole panel, and opens it again.
 * It sits at the bottom left of both the dialog and the sheet, away from
 * `Guardar`: in a dark theatre the two must not be next to each other.
 *
 * Disqualifying asks first, because it takes the presentation out of the
 * results for every judge. Reinstating asks nothing — it undoes a mistake, and
 * the scores saved before come back with it.
 */

export const disqualifyLabel = "Descalificar";

export const reinstateLabel = "Volver a calificar";

const confirmTitle = "¿Descalificar la presentación?";

const confirmDescription =
  "Se cierra para todo el jurado y queda fuera de los resultados. Cualquier jurado asignado puede volver a calificarla.";

export const disqualifiedNoticeMessage =
  "La presentación está descalificada. Podés dejar una devolución o volver a calificarla.";

export function DisqualificationAction({
  disqualified,
  onSubmitting,
  presentationId,
}: {
  disqualified: boolean;
  /** Told before the post, so a page-level discard guard lets it through. */
  onSubmitting?: () => void;
  presentationId: string;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();

  function post(intent: "disqualify" | "reinstate") {
    const body = new FormData();

    body.set("intent", intent);
    body.set("presentationId", presentationId);
    onSubmitting?.();
    void submit(body, { action: formAction, method: "post" });
  }

  if (disqualified) {
    return (
      <Button type="button" variant="outline" onClick={() => post("reinstate")}>
        {reinstateLabel}
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setIsConfirming(true)}
      >
        {disqualifyLabel}
      </Button>
      <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => post("disqualify")}
            >
              {disqualifyLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Why the form in front of the judge will not take a score. */
export function DisqualifiedNotice() {
  return (
    <Alert variant="warning">
      <AlertCircleIcon aria-hidden="true" />
      <AlertDescription>{disqualifiedNoticeMessage}</AlertDescription>
    </Alert>
  );
}

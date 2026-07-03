import { CircleAlert } from "lucide-react";

import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type ArchivedPersonAlertProps = {
  personLabel: "bailarín" | "profesor";
  onReactivate?: () => void;
};

const archivedPersonMessages = {
  bailarín:
    "Este bailarín está archivado. Reactivalo para que vuelva a aparecer en las listas activas y en próximas selecciones de coreografías.",
  profesor:
    "Este profesor está archivado. Reactivalo para que vuelva a aparecer en las listas activas y en próximas selecciones de coreografías.",
} as const;

export function ArchivedPersonAlert({
  personLabel,
  onReactivate,
}: ArchivedPersonAlertProps) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{archivedPersonMessages[personLabel]}</AlertDescription>
      {onReactivate ? (
        <AlertAction className="top-1/2 -translate-y-1/2">
          <Button type="button" variant="link" size="sm" onClick={onReactivate}>
            Reactivar
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

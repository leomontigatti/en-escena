import { Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const incompleteSheetNoticeMessage =
  "Los criterios de esta planilla no suman 100, así que todavía no se puede puntuar. Avisale a administración para que la complete.";

/**
 * Why a sheet will not take a score yet: administration left its adding
 * maxima short of 100, and a score given on it would lock the criteria with
 * the sheet still short. A lock the judge cannot lift, so `info`.
 */
export function IncompleteSheetNotice() {
  return (
    <Alert variant="info">
      <Info aria-hidden="true" />
      <AlertTitle>Planilla incompleta</AlertTitle>
      <AlertDescription>{incompleteSheetNoticeMessage}</AlertDescription>
    </Alert>
  );
}

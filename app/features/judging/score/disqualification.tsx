import { Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * What a judge's form shows for a presentation administration disqualified.
 * Judges do not disqualify — it is settled from the presentation's scores view
 * — but one may still leave a `Devolución` on it so the academy hears why.
 */

export const disqualifiedNoticeMessage =
  "La presentación está descalificada. Podés dejar una devolución.";

/**
 * Why the form in front of the judge will not take a score. A lock, so `info`:
 * the judge has nothing to fix. It sits above the form, as every alert about a
 * form does.
 */
export function DisqualifiedNotice() {
  return (
    <Alert variant="info">
      <Info aria-hidden="true" />
      <AlertTitle>Presentación descalificada</AlertTitle>
      <AlertDescription>{disqualifiedNoticeMessage}</AlertDescription>
    </Alert>
  );
}

import { InfoIcon } from "lucide-react";

import { AlertStack } from "@/components/shared/alert-stack";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Why a price's fields are locked, above the form card and never inside it: the
 * reason is about the whole row, not a field, and the stack owns the spacing.
 * Shared by the choreography and the seminar price detail.
 */
export function PriceGuardAlerts({ reason }: { reason: string | null }) {
  return (
    <AlertStack>
      {reason ? (
        <Alert variant="info">
          <InfoIcon aria-hidden="true" />
          <AlertDescription>{reason}</AlertDescription>
        </Alert>
      ) : null}
    </AlertStack>
  );
}

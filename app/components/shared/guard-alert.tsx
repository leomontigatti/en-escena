import { Info } from "lucide-react";

import { AlertStack } from "@/components/shared/alert-stack";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Why a row's fields are locked, above the form card or the tabs and never
 * inside them: the reason is about the whole row, not a field, and the stack
 * owns the spacing. Shared by the price details and the seminar detail.
 */
export function GuardAlert({ reason }: { reason: string | null }) {
  return (
    <AlertStack>
      {reason ? (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertTitle>Datos bloqueados</AlertTitle>
          <AlertDescription>{reason}</AlertDescription>
        </Alert>
      ) : null}
    </AlertStack>
  );
}

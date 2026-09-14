import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

/** Why a field of the form is locked, above the fields it locks. */
export function GuardAlert({ reason }: { reason: string | null }) {
  if (!reason) {
    return null;
  }

  return (
    <Alert variant="info">
      <InfoIcon aria-hidden="true" />
      <AlertDescription>{reason}</AlertDescription>
    </Alert>
  );
}

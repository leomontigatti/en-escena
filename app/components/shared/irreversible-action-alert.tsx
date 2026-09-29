import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * The warning a confirmation carries before an action that cannot be undone:
 * delete, merge, re-order. The description may name what exactly is lost.
 */
export function IrreversibleActionAlert({
  children = "Esta acción es irreversible.",
}: {
  children?: ReactNode;
}) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>Revisá antes de confirmar</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

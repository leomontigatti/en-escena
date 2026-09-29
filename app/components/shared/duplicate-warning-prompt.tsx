import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { acknowledgedDuplicateIdsField } from "@/lib/shared/duplicate-warning";

type DuplicateWarningPromptProps = {
  children: ReactNode;
  formId: string;
  matchIds: readonly string[];
};

/**
 * The form side of the duplicate warning: the records the server found, and a
 * submit that repeats the same values carrying their ids. The server warns
 * again when a match those ids do not cover appeared meanwhile.
 *
 * It sits above the form card like every other alert about the form, so the
 * submit and the ids reach the form through the `form` attribute.
 */
export function DuplicateWarningPrompt({
  children,
  formId,
  matchIds,
}: DuplicateWarningPromptProps) {
  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Posible duplicado</AlertTitle>
      <AlertDescription aria-live="polite" className="flex flex-col gap-3">
        <div>{children}</div>
        {matchIds.map((matchId) => (
          <input
            key={matchId}
            form={formId}
            name={acknowledgedDuplicateIdsField}
            type="hidden"
            value={matchId}
          />
        ))}
        <Button
          className="self-start"
          form={formId}
          type="submit"
          variant="outline"
          size="sm"
        >
          Continuar de todos modos
        </Button>
      </AlertDescription>
    </Alert>
  );
}

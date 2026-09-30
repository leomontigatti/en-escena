import { Check } from "lucide-react";

import { DuplicateWarningDialog } from "@/components/shared/duplicate-warning-prompt";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * The wizard's half of the duplicate warning. The wizard submits through a
 * fetcher instead of a form, so it repeats the same values with the ids the
 * academy saw rather than carrying them in hidden fields like the rest of the
 * mechanism does.
 */
export function ChoreographyDuplicateWarning({
  isSubmitting,
  message,
  onContinue,
  warning,
}: {
  isSubmitting: boolean;
  message: string;
  onContinue: () => void;
  warning: object;
}) {
  return (
    <DuplicateWarningDialog
      isPending={isSubmitting}
      title="¿Guardar la coreografía?"
      warning={warning}
      confirmButton={
        <Button type="button" disabled={isSubmitting} onClick={onContinue}>
          {isSubmitting ? (
            <Spinner aria-hidden="true" data-icon />
          ) : (
            <Check aria-hidden="true" data-icon="inline-start" />
          )}
          Guardar
        </Button>
      }
    >
      {message}
    </DuplicateWarningDialog>
  );
}

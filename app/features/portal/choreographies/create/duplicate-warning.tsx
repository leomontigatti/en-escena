import { DuplicateWarningDialog } from "@/components/shared/duplicate-warning-prompt";
import { Button } from "@/components/ui/button";

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
      title="¿Es la misma coreografía?"
      warning={warning}
      continueButton={
        <Button type="button" disabled={isSubmitting} onClick={onContinue}>
          Continuar de todos modos
        </Button>
      }
    >
      {message}
    </DuplicateWarningDialog>
  );
}

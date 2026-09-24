import { AccessNotice } from "@/components/auth/access-ui";
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
}: {
  isSubmitting: boolean;
  message: string;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <AccessNotice variant="warning">{message}</AccessNotice>

      <Button
        type="button"
        disabled={isSubmitting}
        variant="outline"
        onClick={onContinue}
      >
        Continuar de todos modos
      </Button>
    </div>
  );
}

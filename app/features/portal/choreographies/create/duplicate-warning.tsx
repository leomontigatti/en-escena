import { Check } from "lucide-react";

import {
  DuplicateMatchLink,
  DuplicateWarningDialog,
  joinSpanishList,
} from "@/components/shared/duplicate-warning-prompt";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ChoreographyCastMatch } from "@/lib/choreographies/choreography-duplicates";

/**
 * The wizard's half of the duplicate warning. The wizard submits through a
 * fetcher instead of a form, so it repeats the same values with the ids the
 * academy saw rather than carrying them in hidden fields like the rest of the
 * mechanism does. Each piece it found links to its page, beside the wizard.
 */
export function ChoreographyDuplicateWarning({
  isSubmitting,
  matches,
  onContinue,
  warning,
}: {
  isSubmitting: boolean;
  matches: readonly ChoreographyCastMatch[];
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
            <Spinner aria-hidden="true" data-icon="inline-start" />
          ) : (
            <Check aria-hidden="true" data-icon="inline-start" />
          )}
          Guardar
        </Button>
      }
    >
      <p>
        Ya existe una coreografía con el mismo nombre y los mismos bailarines en
        este evento:{" "}
        {joinSpanishList(
          matches.map((match) => (
            <DuplicateMatchLink
              key={match.id}
              href={`/portal/coreografias/${match.id}`}
            >
              {match.name}
            </DuplicateMatchLink>
          )),
        )}
        .
      </p>
    </DuplicateWarningDialog>
  );
}

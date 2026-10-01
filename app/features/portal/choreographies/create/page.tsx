import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router";

import { AccessNotice } from "@/components/auth/access-ui";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { ChoreographyDuplicateWarning } from "@/features/portal/choreographies/create/duplicate-warning";
import type { CreateChoreographyRouteData } from "@/features/portal/choreographies/create/server";
import { CreateChoreographyStepContent } from "@/features/portal/choreographies/create/steps";
import {
  useCreateChoreographyWizard,
  type CreateChoreographyWizard,
} from "@/features/portal/choreographies/create/use-create-choreography-wizard";

export function CreateChoreographyPage({
  loaderData,
}: {
  loaderData: CreateChoreographyRouteData;
}) {
  const wizard = useCreateChoreographyWizard(loaderData);
  const { currentStepIndex, steps, submission } = wizard;

  return (
    // Fills the height under the portal header, through main's bottom padding,
    // so the actions rest on the bottom edge even when the step is short.
    <div className="mx-auto -mb-6 flex w-full max-w-2xl flex-1 flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-lg font-semibold">Nueva coreografía</h1>
          <span className="text-sm text-muted-foreground">
            Paso {currentStepIndex + 1} de {steps.length}
          </span>
        </div>
        <Progress value={((currentStepIndex + 1) / steps.length) * 100} />
      </header>

      <div className="flex flex-1 flex-col gap-5">
        {wizard.isLoadingStep ? (
          <div
            aria-busy="true"
            className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner aria-hidden="true" />
            Cargando la coreografía…
          </div>
        ) : (
          <CreateChoreographyStepContent
            loaderData={loaderData}
            wizard={wizard}
          />
        )}
      </div>

      {submission.error ? (
        <AccessNotice
          title="No se pudo registrar la coreografía"
          variant="error"
        >
          {submission.error}
        </AccessNotice>
      ) : null}

      {submission.warning ? (
        <ChoreographyDuplicateWarning
          isSubmitting={submission.isSubmitting}
          matches={submission.warning.matches}
          warning={submission.warning}
          onContinue={() => submission.confirm(submission.warning?.matchIds)}
        />
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex items-center justify-between gap-3 bg-background px-4 py-3">
        {currentStepIndex === 0 ? (
          <Button asChild variant="outline">
            <Link to="/portal/coreografias" onClick={wizard.clearAnswers}>
              Cancelar
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={submission.isSubmitting}
            onClick={wizard.goBack}
          >
            <ChevronLeft aria-hidden="true" data-icon />
            Anterior
          </Button>
        )}
        <CreateChoreographyNextAction wizard={wizard} />
      </div>
    </div>
  );
}

function CreateChoreographyNextAction({
  wizard,
}: {
  wizard: CreateChoreographyWizard;
}) {
  const { canAdvance, currentStep, isLoadingStep, isResolving, submission } =
    wizard;

  if (currentStep === "summary") {
    return (
      <Button
        type="button"
        disabled={submission.isSubmitting}
        onClick={wizard.goNext}
      >
        {submission.isSubmitting ? (
          <Spinner aria-hidden="true" data-icon />
        ) : (
          <Check aria-hidden="true" data-icon />
        )}
        Guardar
      </Button>
    );
  }

  return (
    <Button
      type="button"
      disabled={!canAdvance || isResolving || isLoadingStep}
      onClick={wizard.goNext}
    >
      Siguiente
      {isResolving ? (
        <Spinner aria-hidden="true" data-icon />
      ) : (
        <ChevronRight aria-hidden="true" data-icon />
      )}
    </Button>
  );
}

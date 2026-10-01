import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router";

import { AccessNotice } from "@/components/auth/access-ui";
import { PinnedActions } from "@/components/shared/pinned-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <section
      aria-labelledby="nueva-coreografia-title"
      className="flex flex-1 flex-col gap-6"
    >
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="nueva-coreografia-title" className="text-xl font-semibold">
              Nueva coreografía
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Registrala en el evento activo, un paso a la vez.
            </p>
          </div>
          <span className="shrink-0 text-sm text-muted-foreground">
            Paso {currentStepIndex + 1} de {steps.length}
          </span>
        </div>
        <Progress value={((currentStepIndex + 1) / steps.length) * 100} />
      </header>

      <Card className="overflow-clip">
        <CardContent className="flex flex-col gap-5">
          {wizard.isLoadingStep ? (
            <div
              aria-busy="true"
              className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
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

          {/* Inside the card, beside the button that raised them. */}
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
              message={submission.warning.message}
              warning={submission.warning}
              onContinue={() =>
                submission.confirm(submission.warning?.matchIds)
              }
            />
          ) : null}
        </CardContent>

        <PinnedActions>
          {currentStepIndex === 0 ? (
            <Button asChild variant="outline">
              <Link to="/portal/coreografias" onClick={wizard.clearAnswers}>
                Cancelar
              </Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={wizard.goBack}>
              <ChevronLeft aria-hidden="true" data-icon />
              Anterior
            </Button>
          )}
          <CreateChoreographyNextAction wizard={wizard} />
        </PinnedActions>
      </Card>
    </section>
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

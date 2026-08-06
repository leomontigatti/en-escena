/**
 * THROWAWAY PROTOTYPE — variant B for ticket #623: "Aviso sobre el elenco".
 *
 * Stance: the wall lands on the lever. `deriveGroupType` is a pure function of
 * roster size, so the refusal is stated next to the roster, which stays visible
 * and editable — the academy is told what was derived, and can act on it or not.
 * The copy deliberately states the fact and stops there: it never suggests
 * removing a dancer to dodge a pricing gap.
 *
 * The schedule step drops the `Select` for selectable cards, so every option
 * explains itself inline instead of only on selection.
 */
import { Check, TriangleAlert } from "lucide-react";

import { AlertStack } from "@/components/shared/alert-stack";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/shared/utils";

import {
  CreateChoreographyDancersField,
  CreateChoreographyProfessorsField,
} from "../create/fields";
import { isPriced, prototypeDancers, prototypeProfessors } from "./fixtures";
import { PrototypeSummary } from "./summary";
import {
  formatOptionLabel,
  type PrototypeVariant,
  type PrototypeWizard,
} from "./wizard";

function RefusalAlert({ wizard }: { wizard: PrototypeWizard }) {
  const groupTypeText = wizard.groupTypeLabel.toLowerCase();
  const option = wizard.blockedOption;

  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Todavía no podemos registrar esta coreografía</AlertTitle>
      <AlertDescription>
        {option
          ? `Con ${wizard.dancerCount} bailarines se inscribe como ${groupTypeText}, y el valor de inscripción para ${groupTypeText} todavía no está publicado para ${formatOptionLabel(option)}.`
          : `Con ${wizard.dancerCount} bailarines se inscribe como ${groupTypeText}, y el valor de inscripción para ${groupTypeText} todavía no está publicado en ningún cronograma de este evento.`}
      </AlertDescription>
    </Alert>
  );
}

function ScheduleOptionCards({ wizard }: { wizard: PrototypeWizard }) {
  const groupTypeText = wizard.groupTypeLabel.toLowerCase();

  return (
    <div
      className="flex flex-col gap-3"
      role="radiogroup"
      aria-label="Cronograma"
    >
      {wizard.options.map((option) => {
        const priced = isPriced(option, wizard.groupType);
        const selected = wizard.selectedOption?.id === option.id;

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => wizard.selectSchedule(option.id)}
            className={cn(
              "flex flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent",
              selected && "border-primary bg-accent",
            )}
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">
                {formatOptionLabel(option)}
              </span>
              {priced ? (
                selected ? (
                  <Check aria-hidden="true" className="size-4" />
                ) : null
              ) : (
                <Badge variant="warning">No disponible</Badge>
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              {priced
                ? `Cupo para ${option.capacity} coreografías`
                : `El valor de inscripción para ${groupTypeText} todavía no está publicado para este cronograma.`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function VariantBBody({ wizard }: { wizard: PrototypeWizard }) {
  if (wizard.currentStep === "dancers") {
    return (
      <section className="flex flex-col gap-6">
        <AlertStack>
          {wizard.resolutionRefused ? <RefusalAlert wizard={wizard} /> : null}
        </AlertStack>

        <CreateChoreographyDancersField
          control={wizard.form.control}
          dancers={prototypeDancers}
          onValueChange={() => wizard.form.setValue("scheduleCapacityId", "")}
        />
      </section>
    );
  }

  if (wizard.currentStep === "schedule") {
    return (
      <section className="flex flex-col gap-3">
        <FieldLabel>Cronograma</FieldLabel>
        <ScheduleOptionCards wizard={wizard} />
      </section>
    );
  }

  if (wizard.currentStep === "professors") {
    return (
      <section className="flex flex-col gap-6">
        <CreateChoreographyProfessorsField
          control={wizard.form.control}
          professors={prototypeProfessors}
        />
      </section>
    );
  }

  return <PrototypeSummary wizard={wizard} />;
}

export const variantB: PrototypeVariant = {
  key: "B",
  name: "Aviso sobre el elenco",
  Body: VariantBBody,
};

/**
 * THROWAWAY PROTOTYPE — variant A for ticket #623: "Estado del evento".
 *
 * Stance: the gap is a property of the event, not of anything the academy did.
 * Wherever it is hit — the wall at the end of the flow, or an option chosen on
 * the schedule step — it renders as the same blocked panel, in the register the
 * `event-not-ready` blocker already uses (`components/portal/ui.tsx:645-660`).
 * The roster disappears behind the panel: there is nothing to adjust here.
 */
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

import {
  CreateChoreographyDancersField,
  CreateChoreographyProfessorsField,
  CreateChoreographySelectField,
} from "../create/fields";
import { isPriced, prototypeDancers, prototypeProfessors } from "./fixtures";
import { PrototypeSummary } from "./summary";
import {
  formatOptionLabel,
  type PrototypeVariant,
  type PrototypeWizard,
} from "./wizard";

/**
 * The wall: no schedule of this event carries a price for the resolved group
 * type, so there is nothing to choose between.
 *
 * `warning` + `TriangleAlert` is the register the `event-not-ready` blocker
 * already uses (`components/portal/ui.tsx:227-249` maps `blocked` to exactly
 * that). Description-only, no title — the shape `AccessNotice` already uses
 * (`components/auth/access-ui.tsx:120-142`), which this cannot reuse directly
 * because it has no `warning` variant.
 */
function BlockedAlert() {
  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>
        No encontramos un precio para este tipo de grupo. Por favor comunicate
        con nosotros.
      </AlertDescription>
    </Alert>
  );
}

function VariantABody({ wizard }: { wizard: PrototypeWizard }) {
  if (wizard.currentStep === "dancers") {
    if (wizard.resolutionRefused) {
      return <BlockedAlert />;
    }

    return (
      <section className="flex flex-col gap-6">
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
      <section className="flex flex-col gap-5">
        {/*
         * Unpriced options are rendered disabled — which **overturns #621**,
         * where unavailable options were "shown, not hidden or disabled".
         * Decided deliberately by the dev; recorded as an amendment on #621.
         * No alert accompanies it: the option cannot be selected, so there is
         * no selection to explain.
         */}
        <CreateChoreographySelectField
          control={wizard.form.control}
          fieldName="scheduleCapacityId"
          id="prototype-schedule"
          label="Cronograma"
          options={wizard.options.map((option) => ({
            value: option.id,
            label: formatOptionLabel(option),
            disabled: !isPriced(option, wizard.groupType),
          }))}
        />
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

export const variantA: PrototypeVariant = {
  key: "A",
  name: "Estado del evento",
  Body: VariantABody,
  // No dedicated exit: the wall leaves a disabled "Siguiente" and "Anterior".
};

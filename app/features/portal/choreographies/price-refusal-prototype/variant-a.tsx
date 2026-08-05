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

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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
 * The same alert wherever the gap is hit, in the register the `event-not-ready`
 * blocker already uses (`components/portal/ui.tsx:227-249` maps `blocked` to
 * `warning` + `TriangleAlert`).
 *
 * `scope: "event"` is the wall — one schedule or several, none of them priced,
 * so there is nothing to choose between and the copy stays generic. It still
 * names the group type: without it the message would read as "this event is
 * closed", when solos and duos register fine.
 */
function BlockedAlert({
  wizard,
  scope,
}: {
  wizard: PrototypeWizard;
  scope: "event" | "schedule";
}) {
  const groupTypeText = wizard.groupTypeLabel.toLowerCase();
  const option = wizard.blockedOption;

  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>
        El valor de inscripción para {groupTypeText} todavía no está publicado
      </AlertTitle>
      <AlertDescription>
        {scope === "schedule" && option
          ? `La organización todavía no publicó el valor de inscripción para ${groupTypeText} en ${formatOptionLabel(option)}. Elegí otro cronograma o volvé cuando esté publicado.`
          : `La organización todavía no publicó el valor de inscripción para ${groupTypeText} en este evento. Cuando lo publique vas a poder registrar la coreografía.`}
      </AlertDescription>
    </Alert>
  );
}

function VariantABody({ wizard }: { wizard: PrototypeWizard }) {
  if (wizard.currentStep === "dancers") {
    if (wizard.resolutionRefused) {
      return <BlockedAlert wizard={wizard} scope="event" />;
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
        <CreateChoreographySelectField
          control={wizard.form.control}
          fieldName="scheduleCapacityId"
          id="prototype-schedule"
          label="Cronograma"
          options={wizard.options.map((option) => ({
            value: option.id,
            label: isPriced(option, wizard.groupType)
              ? formatOptionLabel(option)
              : `${formatOptionLabel(option)} · No disponible`,
          }))}
        />

        {wizard.blockedAtSchedule ? (
          <BlockedAlert wizard={wizard} scope="schedule" />
        ) : null}
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
  // The flow is over: the only forward action left is leaving.
  footer: (wizard) =>
    wizard.resolutionRefused ? (
      <Button type="button" variant="outline">
        Cerrar
      </Button>
    ) : null,
};

/**
 * THROWAWAY PROTOTYPE — variant A for ticket #623: "Estado del evento".
 *
 * Stance: the gap is a property of the event, not of anything the academy did.
 * Wherever it is hit — the wall at the end of the flow, or an option chosen on
 * the schedule step — it renders as the same blocked panel, in the register the
 * `event-not-ready` blocker already uses (`components/portal/ui.tsx:645-660`).
 * The roster disappears behind the panel: there is nothing to adjust here.
 */
import { CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

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

function BlockedPanel({ wizard }: { wizard: PrototypeWizard }) {
  const groupTypeText = wizard.groupTypeLabel.toLowerCase();
  const option = wizard.blockedOption;

  return (
    <Empty className="min-h-64 border">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="size-10 [&_svg:not([class*='size-'])]:size-5"
        >
          <CalendarClock aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          El valor de inscripción para {groupTypeText} todavía no está publicado
        </EmptyTitle>
        <EmptyDescription>
          {option
            ? `La organización todavía no publicó el valor de inscripción para ${groupTypeText} en ${formatOptionLabel(option)}. Cuando lo publique vas a poder registrar la coreografía.`
            : `La organización todavía no publicó el valor de inscripción para ${groupTypeText} en ninguno de los cronogramas de este evento. Cuando lo publique vas a poder registrar la coreografía.`}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function VariantABody({ wizard }: { wizard: PrototypeWizard }) {
  if (wizard.currentStep === "dancers") {
    if (wizard.resolutionRefused) {
      return <BlockedPanel wizard={wizard} />;
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

        {wizard.blockedAtSchedule ? <BlockedPanel wizard={wizard} /> : null}
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

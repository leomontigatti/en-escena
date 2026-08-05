/**
 * THROWAWAY PROTOTYPE — variant C for ticket #623: "Resolución".
 *
 * Stance: neither an error nor a blocker — a readout of what the system worked
 * out from the roster, with one line unresolved. The single-schedule wall and
 * the multiple-schedule step become the *same* screen: the schedule row holds a
 * picker when there is a choice, and the "Valor de inscripción" row re-resolves
 * on selection, so the explanation lives on selection rather than per option.
 */
import { Badge } from "@/components/ui/badge";
import { FieldDescription, FieldLabel } from "@/components/ui/field";

import {
  CreateChoreographyDancersField,
  CreateChoreographyProfessorsField,
  CreateChoreographySelectField,
} from "../create/fields";
import {
  isPriced,
  prototypeCategoryLabel,
  prototypeDancers,
  prototypeModalityLabel,
  prototypeProfessors,
} from "./fixtures";
import { PrototypeSummary } from "./summary";
import {
  formatOptionLabel,
  type PrototypeVariant,
  type PrototypeWizard,
} from "./wizard";

function ResolutionReadout({ wizard }: { wizard: PrototypeWizard }) {
  const groupTypeText = wizard.groupTypeLabel.toLowerCase();
  const option = wizard.selectedOption ?? wizard.soleOption;
  const priced = option !== null && isPriced(option, wizard.groupType);
  const pending = option === null || !priced;

  return (
    <section className="flex flex-col gap-3" aria-label="Resolución">
      <FieldLabel>Resolución</FieldLabel>

      <dl className="flex flex-col gap-3">
        <ReadoutRow label="Modalidad" value={prototypeModalityLabel} />
        <ReadoutRow
          label="Tipo de grupo"
          value={`${wizard.groupTypeLabel} · ${wizard.dancerCount} bailarines`}
        />
        <ReadoutRow label="Categoría" value={prototypeCategoryLabel} />

        {wizard.scheduleStatus === "multiple" ? (
          <CreateChoreographySelectField
            control={wizard.form.control}
            fieldName="scheduleCapacityId"
            id="prototype-schedule-c"
            label="Cronograma"
            options={wizard.options.map((scheduleOption) => ({
              value: scheduleOption.id,
              label: formatOptionLabel(scheduleOption),
            }))}
          />
        ) : (
          <ReadoutRow
            label="Cronograma"
            value={option ? formatOptionLabel(option) : "—"}
          />
        )}

        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
          <dt className="min-w-40 text-xs font-semibold uppercase text-muted-foreground">
            Valor de inscripción
          </dt>
          <dd className="flex flex-1 flex-col gap-1 text-sm">
            {pending ? (
              <>
                <Badge variant="warning" className="w-fit">
                  Pendiente de publicación
                </Badge>
                <FieldDescription>
                  {option
                    ? `La organización todavía no publicó el valor para ${groupTypeText} en este cronograma.`
                    : `La organización todavía no publicó el valor para ${groupTypeText} en este evento.`}
                </FieldDescription>
              </>
            ) : (
              <Badge variant="success" className="w-fit">
                Publicado
              </Badge>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function ReadoutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="min-w-40 text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function VariantCBody({ wizard }: { wizard: PrototypeWizard }) {
  if (wizard.currentStep === "dancers") {
    return (
      <section className="flex flex-col gap-6">
        <CreateChoreographyDancersField
          control={wizard.form.control}
          dancers={prototypeDancers}
          onValueChange={() => wizard.form.setValue("scheduleCapacityId", "")}
        />

        {wizard.resolutionRefused ? (
          <ResolutionReadout wizard={wizard} />
        ) : null}
      </section>
    );
  }

  if (wizard.currentStep === "schedule") {
    return <ResolutionReadout wizard={wizard} />;
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

export const variantC: PrototypeVariant = {
  key: "C",
  name: "Resolución",
  Body: VariantCBody,
};

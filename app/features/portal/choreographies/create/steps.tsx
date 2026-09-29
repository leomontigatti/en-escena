import { AccessNotice } from "@/components/auth/access-ui";
import { OptionCardsField } from "@/components/shared/option-cards-field";
import { ChecklistField } from "@/components/shared/checklist-field";
import { TextInputField } from "@/components/shared/text-input-field";
import {
  everyScheduleCapacityFullMessage,
  type PortalResolvedRegistrationResolution,
} from "@/features/portal/choreographies/create/flow";
import { formatCategoryAndGroupTypeSummary } from "@/features/portal/choreographies/create/formatters";
import type { CreateChoreographyRouteData } from "@/features/portal/choreographies/create/server";
import { StepIntro } from "@/features/portal/choreographies/create/step-intro";
import { ChoreographyCreationSummary } from "@/features/portal/choreographies/create/summary";
import type { CreateChoreographyWizard } from "@/features/portal/choreographies/create/use-create-choreography-wizard";
import {
  isEveryScheduleCapacityOptionFull,
  toScheduleCapacitySelectOptions,
  type ScheduleCapacitySelectOption,
} from "@/lib/choreographies/schedule-capacity-options";

type StepProps = {
  loaderData: CreateChoreographyRouteData;
  wizard: CreateChoreographyWizard;
};

export function CreateChoreographyStepContent(props: StepProps) {
  switch (props.wizard.currentStep) {
    case "choreography":
      return <ChoreographyStep {...props} />;
    case "dancers":
      return <DancersStep {...props} />;
    case "category":
      return props.wizard.resolution ? (
        <CategoryStep
          resolution={props.wizard.resolution}
          wizard={props.wizard}
        />
      ) : null;
    case "professors":
      return <ProfessorsStep {...props} />;
    case "summary":
      return props.wizard.resolution ? (
        <ChoreographyCreationSummary
          baseOptions={props.loaderData.registrationBaseOptions}
          professors={props.loaderData.activeProfessors}
          resolution={props.wizard.resolution}
          values={props.wizard.values}
          onEdit={props.wizard.goTo}
        />
      ) : null;
  }
}

function ChoreographyStep({ loaderData, wizard }: StepProps) {
  const { form, submodalities } = wizard;

  return (
    <>
      <StepIntro
        title="La coreografía"
        hint="Su nombre y en qué modalidad compite."
      />
      <TextInputField
        autoComplete="off"
        control={form.control}
        label="Nombre"
        name="name"
        placeholder="Una vez guardado no puede modificarse"
      />
      <OptionCardsField
        control={form.control}
        label="Modalidad"
        name="modalityId"
        onValueChange={wizard.chooseModality}
        options={loaderData.registrationBaseOptions.modalities.map(
          (modality) => ({ value: modality.id, label: modality.name }),
        )}
      />
      {submodalities.length > 0 ? (
        <OptionCardsField
          control={form.control}
          label="Submodalidad"
          name="submodalityId"
          onValueChange={wizard.resetResolution}
          options={submodalities.map((submodality) => ({
            value: submodality.id,
            label: submodality.name,
          }))}
        />
      ) : null}
    </>
  );
}

function DancersStep({ loaderData, wizard }: StepProps) {
  return (
    <>
      <StepIntro
        title="¿Quiénes bailan?"
        hint="Marcá a todos los bailarines de la coreografía y tocá Siguiente."
      />
      {wizard.refusal ? (
        <AccessNotice variant="error">{wizard.refusal}</AccessNotice>
      ) : null}
      <ChecklistField
        control={wizard.form.control}
        emptySelectionMessage="Todavía no seleccionaste bailarines."
        height="fill"
        label="Bailarines"
        name="dancerIds"
        onValueChange={wizard.resetResolution}
        options={loaderData.activeDancers.map((dancer) => ({
          value: dancer.id,
          label: `${dancer.firstName} ${dancer.lastName}`,
        }))}
        searchLabel="Buscar bailarines"
      />
    </>
  );
}

/**
 * The category follows from the dancers, so it is shown, not asked; the level
 * and the schedule are asked only when the resolution leaves a choice. A
 * schedule option says when it happens, never how many places it has left: a
 * full one is greyed out, and the server's refusal on save stays the guarantee.
 */
function CategoryStep({
  resolution,
  wizard,
}: {
  resolution: PortalResolvedRegistrationResolution;
  wizard: CreateChoreographyWizard;
}) {
  const scheduleOptions =
    resolution.schedule.status === "multiple"
      ? resolution.schedule.options
      : [];

  return (
    <>
      <StepIntro
        title="Categoría"
        hint="Sale de las edades de los bailarines. Si no es la que esperabas, volvé y revisá quiénes bailan."
      />
      <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 px-4 py-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase">
          Compite en
        </span>
        <span className="text-base font-medium">
          {formatCategoryAndGroupTypeSummary(resolution)}
        </span>
      </div>
      {resolution.experienceLevel.required ? (
        <OptionCardsField
          control={wizard.form.control}
          label="Nivel de experiencia"
          name="experienceLevelId"
          options={resolution.experienceLevel.options.map((option) => ({
            value: option.id,
            label: option.name,
          }))}
        />
      ) : null}
      <ScheduleChoice options={scheduleOptions} wizard={wizard} />
    </>
  );
}

function ScheduleChoice({
  options,
  wizard,
}: {
  options: ScheduleCapacitySelectOption[];
  wizard: CreateChoreographyWizard;
}) {
  if (options.length === 0) {
    return null;
  }

  if (isEveryScheduleCapacityOptionFull(options)) {
    return (
      <AccessNotice variant="info">
        {everyScheduleCapacityFullMessage}
      </AccessNotice>
    );
  }

  return (
    <OptionCardsField
      control={wizard.form.control}
      label="Cronograma"
      name="scheduleCapacityId"
      options={toScheduleCapacitySelectOptions(options)}
    />
  );
}

function ProfessorsStep({ loaderData, wizard }: StepProps) {
  return (
    <>
      <StepIntro
        title="¿Quiénes la prepararon?"
        hint="Marcá a los profesores de la coreografía y tocá Siguiente."
      />
      <ChecklistField
        control={wizard.form.control}
        emptySelectionMessage="Todavía no seleccionaste profesores."
        height="fill"
        label="Profesores"
        name="professorIds"
        options={loaderData.activeProfessors.map((professor) => ({
          value: professor.id,
          label: `${professor.firstName} ${professor.lastName}`,
        }))}
        searchLabel="Buscar profesores"
      />
    </>
  );
}

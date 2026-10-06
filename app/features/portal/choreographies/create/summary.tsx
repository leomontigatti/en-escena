import { Pencil } from "lucide-react";
import type { ReactNode } from "react";

import { Controller } from "react-hook-form";

import { AccessNotice } from "@/components/auth/access-ui";
import { ProfessionalEvaluationSwitch } from "@/components/shared/professional-evaluation-switch";
import { Button } from "@/components/ui/button";
import { normalizeChoreographyName } from "@/lib/choreographies/choreography-name";
import type { ChoreographyRegistrationBaseOptions } from "@/lib/events/bases.server";
import type {
  CreateChoreographyForm,
  CreateChoreographyFormValues,
  CreateChoreographyStep,
  PortalResolvedRegistrationResolution,
} from "@/features/portal/choreographies/create/flow";
import {
  formatCategoryAndGroupTypeSummary,
  formatExperienceLevelSummary,
  formatModalitySummary,
  formatPeopleNames,
  formatScheduleSummary,
} from "@/features/portal/choreographies/create/formatters";
import type { ActiveProfessor } from "@/features/portal/choreographies/create/shared";
import { StepIntro } from "@/features/portal/choreographies/create/step-intro";

/**
 * Every answer with a way back to the step that gave it. The category has none:
 * it follows from the dancers, so it is changed there. Its row carries the one
 * answer asked here, `Evaluar como profesional`, in the room `Cambiar` leaves.
 */
export function ChoreographyCreationSummary({
  baseOptions,
  form,
  onEdit,
  professors,
  resolution,
  values,
}: {
  baseOptions: ChoreographyRegistrationBaseOptions;
  form: CreateChoreographyForm;
  onEdit: (step: CreateChoreographyStep) => void;
  professors: ActiveProfessor[];
  resolution: PortalResolvedRegistrationResolution;
  values: CreateChoreographyFormValues;
}) {
  const selectedProfessors = professors.filter((professor) =>
    values.professorIds.includes(professor.id),
  );
  const isScheduleChosen = resolution.schedule.status === "multiple";

  return (
    <>
      <StepIntro
        title="Revisá antes de guardar"
        hint="Tocá el botón Cambiar para corregir alguno de los datos."
      />
      <AccessNotice
        title="Estos datos no se pueden cambiar después"
        variant="warning"
      >
        Una vez guardada la coreografía, solo vas a poder cambiar la música y si
        se evalúa como profesional.
      </AccessNotice>
      <dl
        aria-label="Resumen de coreografía"
        className="@container flex flex-col divide-y rounded-lg border"
      >
        <SummaryRow label="Nombre" onEdit={() => onEdit("choreography")}>
          {normalizeChoreographyName(values.name)}
        </SummaryRow>
        <SummaryRow label="Modalidad" onEdit={() => onEdit("choreography")}>
          {formatModalitySummary(
            baseOptions,
            values.modalityId,
            values.submodalityId ?? "",
          )}
        </SummaryRow>
        <SummaryRow
          label={`Bailarines (${resolution.dancers.length})`}
          onEdit={() => onEdit("dancers")}
        >
          {formatPeopleNames(resolution.dancers)}
        </SummaryRow>
        <SummaryRow
          label="Categoría"
          trailing={
            <Controller
              control={form.control}
              name="professionalEvaluation"
              render={({ field }) => (
                <ProfessionalEvaluationSwitch
                  checked={field.value}
                  placement="summary"
                  onBlur={field.onBlur}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          }
        >
          {formatCategoryAndGroupTypeSummary(resolution)}
        </SummaryRow>
        {resolution.experienceLevel.required ? (
          <SummaryRow
            label="Nivel de experiencia"
            onEdit={() => onEdit("category")}
          >
            {formatExperienceLevelSummary(
              resolution,
              values.experienceLevelId ?? "",
            )}
          </SummaryRow>
        ) : null}
        <SummaryRow
          label="Cronograma"
          onEdit={isScheduleChosen ? () => onEdit("category") : undefined}
        >
          {formatScheduleSummary(resolution, values.scheduleCapacityId ?? "")}
        </SummaryRow>
        <SummaryRow
          label={`Profesores (${selectedProfessors.length})`}
          onEdit={() => onEdit("professors")}
        >
          {formatPeopleNames(selectedProfessors)}
        </SummaryRow>
      </dl>
    </>
  );
}

function SummaryRow({
  children,
  label,
  onEdit,
  trailing,
}: {
  children: ReactNode;
  label: string;
  onEdit?: () => void;
  /** What the row carries instead of `Cambiar`. */
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex flex-1 flex-col gap-0.5">
        <dt className="text-xs font-semibold text-muted-foreground uppercase">
          {label}
        </dt>
        <dd className="text-sm">{children}</dd>
      </div>
      {trailing}
      {onEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Cambiar ${label}`}
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" data-icon="inline-start" />
          Cambiar
        </Button>
      ) : null}
    </div>
  );
}

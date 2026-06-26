import { FieldLabel } from "@/components/ui/field";
import type { ChoreographyRegistrationBaseOptions } from "@/lib/events/bases.server";
import type { RegistrationResolution } from "@/features/portal/choreographies/create/flow";

import {
  formatCategoryAndGroupTypeSummary,
  formatExperienceLevelSummary,
  formatModalitySummary,
  formatRosterSummary,
  formatScheduleSummary,
} from "@/features/portal/choreographies/create/formatters";
import type { ActiveProfessor } from "@/features/portal/choreographies/create/shared";

export function ChoreographyCreationSummary({
  baseOptions,
  name,
  resolution,
  selectedExperienceLevelId,
  selectedModalityId,
  selectedProfessors,
  selectedScheduleCapacityId,
  selectedSubmodalityId,
}: {
  baseOptions: ChoreographyRegistrationBaseOptions;
  name: string;
  resolution: RegistrationResolution;
  selectedExperienceLevelId: string;
  selectedModalityId: string;
  selectedProfessors: ActiveProfessor[];
  selectedScheduleCapacityId: string;
  selectedSubmodalityId: string;
}) {
  const summaryItems = [
    {
      label: "Nombre",
      value: name.trim() || "Sin nombre",
    },
    {
      label: "Modalidad",
      value: formatModalitySummary(
        baseOptions,
        selectedModalityId,
        selectedSubmodalityId,
      ),
    },
    {
      label: "Categoría",
      value: formatCategoryAndGroupTypeSummary(resolution),
    },
  ];

  if (resolution.experienceLevel.required) {
    summaryItems.push({
      label: "Nivel de experiencia",
      value: formatExperienceLevelSummary(
        resolution,
        selectedExperienceLevelId,
      ),
    });
  }

  summaryItems.push(
    {
      label: "Cronograma",
      value: formatScheduleSummary(resolution, selectedScheduleCapacityId),
    },
    {
      label: "Bailarines",
      value: formatRosterSummary(
        resolution.dancers.map((dancer) => ({
          firstName: dancer.firstName,
          lastName: dancer.lastName,
        })),
        "bailarines",
      ),
    },
    {
      label: "Profesores",
      value: formatRosterSummary(selectedProfessors, "profesores"),
    },
  );

  return (
    <section aria-label="Resumen de coreografía">
      <FieldLabel>Resumen</FieldLabel>
      <dl className="mt-3 flex flex-col gap-3">
        {summaryItems.map((item) => (
          <div key={item.label} className="flex items-baseline gap-3">
            <dt className="min-w-40 text-xs font-semibold uppercase text-muted-foreground">
              {item.label}
            </dt>
            <dd className="text-sm">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

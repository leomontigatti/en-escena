import { type Control } from "react-hook-form";

import { ReadOnlyField } from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import type {
  ChoreographyEditValues,
  ChoreographyRosterEditorLoaderData,
  DancerResolutionState,
} from "@/features/portal/choreographies/detail/roster-editor.shared";
import { resolveChoreographyDancersIntent } from "@/features/portal/choreographies/detail/roster-editor.shared";
import type { ResolveChoreographyDancersResult } from "@/lib/portal/choreography-roster.server";

export { ReadOnlyField as ReadonlyDetailField };

export function ChoreographySelectPreviewField({
  control,
  fieldName,
  id,
  label,
  options,
}: {
  control: Control<ChoreographyEditValues>;
  fieldName: "experienceLevelId" | "scheduleCapacityId";
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <SelectField
      control={control}
      id={id}
      label={label}
      name={fieldName}
      options={options}
      placeholder="Seleccionar"
    />
  );
}

export function getSelectableScheduleOptions(
  scheduleResolution:
    | Extract<
        ResolveChoreographyDancersResult,
        { ok: true }
      >["resolution"]["schedule"]
    | null,
) {
  if (!scheduleResolution || scheduleResolution.status === "none") {
    return [];
  }

  return scheduleResolution.options;
}

export function formatPersonName(person: {
  firstName: string;
  lastName: string;
}) {
  return `${person.firstName} ${person.lastName}`;
}

export function formatScheduleOptionDateTime(option: {
  schedule: {
    name: string;
    scheduledDate?: string;
    startTime?: string;
  };
}) {
  const { scheduledDate, startTime } = option.schedule;

  if (!scheduledDate || !startTime) {
    return option.schedule.name;
  }

  const [year, month, day] = scheduledDate.split("-").map(Number);

  if (!year || !month || !day) {
    return option.schedule.name;
  }

  const date = new Date(year, month - 1, day);
  const formattedDate = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

  return `${formattedDate} - ${startTime.slice(0, 5)} hs.`;
}

export function getSelectionKey(ids: string[]) {
  return [...ids].sort().join("|");
}

export function getPersistedDancerResolutionState(input: {
  experienceLevelId: ChoreographyRosterEditorLoaderData["choreography"]["experienceLevelId"];
  experienceLevelName: ChoreographyRosterEditorLoaderData["choreography"]["experienceLevelName"];
  operationalStatus: ChoreographyRosterEditorLoaderData["choreography"]["operationalStatus"];
  groupType: ChoreographyRosterEditorLoaderData["choreography"]["groupType"];
  categoryId: ChoreographyRosterEditorLoaderData["choreography"]["categoryId"];
  categoryName: ChoreographyRosterEditorLoaderData["choreography"]["categoryName"];
}) {
  return {
    groupType: input.groupType,
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    categoryCalculationMode: null,
    categoryAgeBasis: null,
    experienceLevelRequired:
      input.experienceLevelId !== null ||
      input.operationalStatus.pendingItems.includes("experienceLevel"),
    experienceLevelOptions:
      input.experienceLevelId && input.experienceLevelName
        ? [
            {
              id: input.experienceLevelId,
              name: input.experienceLevelName,
            },
          ]
        : [],
  } satisfies DancerResolutionState;
}

export function mapResolvedDancerResolutionState(
  result: Extract<ResolveChoreographyDancersResult, { ok: true }>,
) {
  return {
    groupType: result.resolution.groupType,
    categoryId: result.resolution.categoryId,
    categoryName: result.resolution.categoryName,
    categoryCalculationMode: result.resolution.categoryCalculationMode ?? null,
    categoryAgeBasis: result.resolution.categoryAgeBasis ?? null,
    experienceLevelRequired: result.resolution.experienceLevel.required,
    experienceLevelOptions: result.resolution.experienceLevel.options,
  } satisfies DancerResolutionState;
}

export function buildResolveChoreographyDancersFormData(dancerIds: string[]) {
  const formData = new FormData();
  formData.set("intent", resolveChoreographyDancersIntent);

  for (const dancerId of dancerIds) {
    formData.append("dancerIds", dancerId);
  }

  return formData;
}

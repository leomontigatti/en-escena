import { Lock } from "lucide-react";
import { useId } from "react";
import { Controller, type Control } from "react-hook-form";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type {
  ChoreographyEditValues,
  CoreografiaPeopleEditorLoaderData,
  DancerResolutionState,
} from "@/lib/portal/coreografia-detail/people-editor.shared";
import { resolveChoreographyDancersIntent } from "@/lib/portal/coreografia-detail/people-editor.shared";
import type { ResolveChoreographyDancersResult } from "@/lib/portal/choreographies.server";

export function ReadonlyDetailField({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  const id = useId();

  return (
    <Field className={className} data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        <div className="relative">
          <Input id={id} value={value} disabled readOnly className="pr-9" />
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </FieldContent>
    </Field>
  );
}

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
    <Controller
      control={control}
      name={fieldName}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldContent>
            <Select
              name={field.name}
              value={field.value ?? ""}
              onValueChange={field.onChange}
            >
              <SelectTrigger
                id={id}
                aria-invalid={fieldState.error ? true : undefined}
                className="w-full"
              >
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
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
  experienceLevelId: CoreografiaPeopleEditorLoaderData["choreography"]["experienceLevelId"];
  experienceLevelName: CoreografiaPeopleEditorLoaderData["choreography"]["experienceLevelName"];
  operationalStatus: CoreografiaPeopleEditorLoaderData["choreography"]["operationalStatus"];
  groupType: CoreografiaPeopleEditorLoaderData["choreography"]["groupType"];
  categoryId: CoreografiaPeopleEditorLoaderData["choreography"]["categoryId"];
  categoryName: CoreografiaPeopleEditorLoaderData["choreography"]["categoryName"];
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
  const UrlSearchParamsCtor =
    typeof window !== "undefined" ? window.URLSearchParams : URLSearchParams;
  const searchParams = new UrlSearchParamsCtor();
  searchParams.set("intent", resolveChoreographyDancersIntent);

  for (const dancerId of dancerIds) {
    searchParams.append("dancerIds", dancerId);
  }

  return searchParams;
}

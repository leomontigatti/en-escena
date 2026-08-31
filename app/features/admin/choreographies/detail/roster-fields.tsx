import { z } from "zod";
import type { Control } from "react-hook-form";

import { SelectField } from "@/components/shared/select-field";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import { requiredFieldMessage } from "@/lib/shared/forms";

import {
  ExperienceLevelField,
  ScheduleCapacityField,
} from "./reassignment-fields";
import type { getExperienceLevelSlotState } from "./roster-form-state";
import type { ChoreographyDetailLoaderData } from "./server";
import type { useRosterForm } from "./use-roster-form";

export const choreographyFormSchema = z.object({
  dancerIds: z.array(z.string()).min(1, requiredFieldMessage),
  experienceLevelId: z.string(),
  musicStorageKey: z.string(),
  name: z.string().trim().min(1, requiredFieldMessage),
  professorIds: z.array(z.string()),
  scheduleCapacityId: z.string(),
});

export type ChoreographyFormValues = z.input<typeof choreographyFormSchema>;

/**
 * The two slots the modality correction can take over, in the shape they have
 * while it does not. `disabled` is how a pending correction holds them: the
 * saved value stays in the same control instead of being swapped for a
 * read-only field, so nothing next to the modalidad select changes shape while
 * its resolution is in flight.
 */
export function RosterExperienceLevelSlot({
  control,
  disabled,
  experienceLevelSlot,
  loaderData,
  options,
}: {
  control: Control<ChoreographyFormValues>;
  disabled: boolean;
  experienceLevelSlot: ReturnType<typeof getExperienceLevelSlotState>;
  loaderData: ChoreographyDetailLoaderData;
  options: Array<{ id: string; name: string }>;
}) {
  if (experienceLevelSlot.showRosterSelect) {
    return (
      <SelectField
        control={control}
        disabled={disabled}
        label="Nivel de experiencia"
        name="experienceLevelId"
        options={options.map((option) => ({
          label: option.name,
          value: option.id,
        }))}
        placeholder="Elegí el nivel"
      />
    );
  }

  return (
    <ExperienceLevelField
      disabled={disabled}
      experienceLevelId={experienceLevelSlot.experienceLevelId}
      loaderData={loaderData}
      requiresExperienceLevel={experienceLevelSlot.requiresExperienceLevel}
    />
  );
}

export function RosterScheduleSlot({
  control,
  disabled,
  loaderData,
  scheduleResolution,
}: {
  control: Control<ChoreographyFormValues>;
  disabled: boolean;
  loaderData: ChoreographyDetailLoaderData;
  scheduleResolution: ReturnType<typeof useRosterForm>["scheduleResolution"];
}) {
  if (!scheduleResolution || scheduleResolution.status !== "multiple") {
    return (
      <ScheduleCapacityField disabled={disabled} loaderData={loaderData} />
    );
  }

  return (
    <SelectField
      control={control}
      disabled={disabled}
      label="Cronograma"
      name="scheduleCapacityId"
      options={scheduleResolution.options.map((option) => ({
        label: formatScheduleDateTime(option.schedule),
        value: option.id,
      }))}
      placeholder="Elegí el cronograma"
    />
  );
}

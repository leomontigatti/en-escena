import type { FieldPath } from "react-hook-form";
import { z } from "zod";

import type {
  ActionData,
  ScheduleActionValues,
} from "@/lib/admin/events/bases-action.server";
import type { ScheduleListItem } from "@/lib/events/bases.server";
import { groupTypeOptions } from "@/lib/events/group-types";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const scheduleDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export const timePickerHourOptions = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
);
export const timePickerMinuteOptions = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, "0"),
);

const scheduleCapacityFormSchema = z.object({
  groupType: z.string().trim().min(1, requiredFieldMessage),
  capacity: z
    .string()
    .trim()
    .min(1, requiredFieldMessage)
    .refine(isPositiveIntegerString, "Ingresá un cupo mayor a cero."),
});

export const inlineScheduleCapacityFormSchema =
  scheduleCapacityFormSchema.extend({
    id: z.string().optional(),
  });

export const scheduleFormSchema = z
  .object({
    name: z.string().trim().min(1, requiredFieldMessage),
    scheduledDate: z.string().trim().min(1, requiredFieldMessage),
    startTime: z.string().trim().min(1, requiredFieldMessage),
    totalCapacity: z
      .string()
      .trim()
      .min(1, requiredFieldMessage)
      .refine(isPositiveIntegerString, "Ingresá un cupo total mayor a cero."),
    modalityIds: z.array(z.string()).min(1, requiredFieldMessage),
    scheduleCapacities: z.array(inlineScheduleCapacityFormSchema),
  })
  .superRefine((values, context) => {
    const firstIndexByGroupType = new Map<string, number>();

    values.scheduleCapacities.forEach((scheduleCapacity, index) => {
      const groupType = scheduleCapacity.groupType.trim();

      if (!groupType) {
        return;
      }

      const firstIndex = firstIndexByGroupType.get(groupType);

      if (firstIndex === undefined) {
        firstIndexByGroupType.set(groupType, index);
        return;
      }

      context.addIssue({
        code: "custom",
        message: "Revisá el tipo de grupo del cupo de cronograma.",
        path: ["scheduleCapacities", firstIndex, "groupType"],
      });
      context.addIssue({
        code: "custom",
        message: "Ya existe un cupo de cronograma para ese tipo de grupo.",
        path: ["scheduleCapacities", index, "groupType"],
      });
    });
  });

export type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

export const emptyScheduleFieldErrors: Record<string, string> = {};
export const emptySelection: string[] = [];
export const emptyScheduleCapacities: ScheduleListItem["scheduleCapacities"] =
  [];

export function parseTimeValue(value: string) {
  const [hour, minute] = value.split(":");

  return {
    hour: hour && timePickerHourOptions.includes(hour) ? hour : undefined,
    minute:
      minute && timePickerMinuteOptions.includes(minute) ? minute : undefined,
  };
}

export function buildScheduleFacetedFilters(schedules: ScheduleListItem[]) {
  return [
    {
      columnId: "modalities",
      label: "Filtros",
      groups: [
        {
          label: "Modalidad",
          options: getScheduleModalityOptions(schedules),
        },
      ],
    },
  ];
}

export function getScheduleModalityOptions(schedules: ScheduleListItem[]) {
  const modalities = schedules.flatMap((schedule) => schedule.modalities);

  return Array.from(
    new Map(
      modalities.map((modality) => [
        modality.id,
        { label: modality.name, value: modality.id },
      ]),
    ).values(),
  ).sort((firstOption, secondOption) =>
    firstOption.label.localeCompare(secondOption.label, "es-AR"),
  );
}

export function createEmptyScheduleCapacityFormValues(): ScheduleFormValues["scheduleCapacities"][number] {
  return {
    groupType: "",
    capacity: "",
  };
}

export function toScheduleCapacityFormValues(
  scheduleCapacity: ScheduleListItem["scheduleCapacities"][number],
): ScheduleFormValues["scheduleCapacities"][number] {
  return {
    id: scheduleCapacity.id,
    groupType: scheduleCapacity.groupType,
    capacity: scheduleCapacity.capacity.toString(),
  };
}

export function getAvailableScheduleCapacityGroupTypeOptions(
  scheduleCapacityValues: ScheduleFormValues["scheduleCapacities"],
  currentIndex: number,
) {
  const currentValue = scheduleCapacityValues[currentIndex]?.groupType;
  const unavailableGroupTypes = new Set(
    scheduleCapacityValues
      .map((scheduleCapacity, index) =>
        index === currentIndex ? "" : scheduleCapacity.groupType,
      )
      .filter(Boolean),
  );

  return groupTypeOptions.filter(
    (option) =>
      option.value === currentValue || !unavailableGroupTypes.has(option.value),
  );
}

export function formatScheduleOccupancy(schedule: ScheduleListItem) {
  return `${schedule.occupiedCapacity}/${schedule.totalCapacity}`;
}

export function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return scheduleDateFormatter.format(new Date(`${value}T00:00:00Z`));
}

export function isPositiveIntegerString(value: string) {
  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0;
}

function isScheduleFormField(
  fieldName: string,
): fieldName is keyof Omit<ScheduleFormValues, "scheduleCapacities"> {
  return [
    "name",
    "scheduledDate",
    "startTime",
    "totalCapacity",
    "modalityIds",
  ].includes(fieldName);
}

export function resolveScheduleFieldName(fieldName: string) {
  if (isScheduleFormField(fieldName)) {
    return fieldName;
  }

  if (/^scheduleCapacities\.\d+\.(id|groupType|capacity)$/.test(fieldName)) {
    return fieldName as FieldPath<ScheduleFormValues>;
  }

  return null;
}

function matchesActionScope(
  actionData: ActionData | undefined,
  {
    intent,
    parentRecordId,
    recordId,
  }: {
    intent: string;
    parentRecordId?: string;
    recordId?: string;
  },
) {
  if (actionData?.scope?.intent !== intent) {
    return false;
  }

  if (recordId && actionData.scope.recordId !== recordId) {
    return false;
  }

  if (parentRecordId && actionData.scope.parentRecordId !== parentRecordId) {
    return false;
  }

  return true;
}

function isScheduleActionValues(
  values: ActionData["values"] | undefined,
): values is ScheduleActionValues {
  return (
    values !== undefined &&
    "scheduledDate" in values &&
    "startTime" in values &&
    "totalCapacity" in values &&
    "modalityIds" in values &&
    "scheduleCapacities" in values
  );
}

export function getScheduleFieldErrors(
  actionData?: ActionData,
  scheduleId?: string,
) {
  if (matchesActionScope(actionData, { intent: "create-schedule" })) {
    return actionData?.fieldErrors ?? emptyScheduleFieldErrors;
  }

  if (
    matchesActionScope(actionData, {
      intent: "update-schedule",
      recordId: scheduleId,
    })
  ) {
    return actionData?.fieldErrors ?? emptyScheduleFieldErrors;
  }

  return emptyScheduleFieldErrors;
}

export function getScheduleSubmittedValues(
  actionData: ActionData | undefined,
  intent: string,
  recordId?: string,
) {
  if (
    !matchesActionScope(actionData, { intent, recordId }) ||
    !isScheduleActionValues(actionData?.values)
  ) {
    return undefined;
  }

  return actionData.values;
}

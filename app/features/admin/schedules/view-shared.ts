import { z } from "zod";

import type {
  ActionData,
  ScheduleActionValues,
} from "@/lib/admin/events/bases-action/shared.server";
import type { DataTableFacetedFiltersOf } from "@/components/shared/data-table";
import type { ScheduleListItem } from "@/lib/events/bases.server";
import { groupTypeOptions } from "@/lib/events/group-types";
import { requiredFieldMessage } from "@/lib/shared/forms";

const scheduleDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const scheduleCapacityFormSchema = z.object({
  groupType: z.string().trim().min(1, requiredFieldMessage),
  capacity: z
    .string()
    .trim()
    .min(1, requiredFieldMessage)
    .refine(isPositiveIntegerString, "Ingresá un cupo mayor a cero."),
});

const inlineScheduleCapacityFormSchema = scheduleCapacityFormSchema.extend({
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

export const emptySelection: string[] = [];
export const emptyScheduleCapacities: ScheduleListItem["scheduleCapacities"] =
  [];

export const scheduleFacetedFilterIds = ["modalidad"] as const;

export function buildScheduleFacetedFilters(
  schedules: ScheduleListItem[],
): DataTableFacetedFiltersOf<typeof scheduleFacetedFilterIds> {
  return [
    {
      id: "modalidad",
      label: "Modalidad",
      options: getScheduleModalityOptions(schedules),
    },
  ];
}

function getScheduleModalityOptions(schedules: ScheduleListItem[]) {
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

function formatAvailablePlaces({
  availablePlaces,
  capacity,
}: {
  availablePlaces: number;
  capacity: number;
}) {
  return `${availablePlaces} de ${capacity}`;
}

/**
 * Read-only text shown right after the capacity, both in the list and inside
 * the field being edited: the capacity is already there, so the suffix only
 * adds what is left of it. One source, so the two surfaces cannot word the
 * same count differently.
 */
export function formatAvailablePlacesSuffix(availablePlaces: number) {
  if (availablePlaces === 0) {
    return " / sin lugares";
  }

  return ` / ${availablePlaces} disponibles`;
}

/**
 * The suffix is decoration that a screen reader never reaches, so the field
 * label spells the same count out in full.
 */
export function describeAvailablePlaces({
  availablePlaces,
  capacity,
}: {
  availablePlaces: number;
  capacity: number;
}) {
  if (availablePlaces === 0) {
    return "Sin lugares disponibles.";
  }

  return `Quedan ${formatAvailablePlaces({ availablePlaces, capacity })} lugares.`;
}

export function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return scheduleDateFormatter.format(new Date(`${value}T00:00:00Z`));
}

function isPositiveIntegerString(value: string) {
  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0;
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

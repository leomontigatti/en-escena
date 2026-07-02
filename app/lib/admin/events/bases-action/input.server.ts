import type {
  EventBasesActionInput,
  NameActionValues,
  NameActionValuesWithId,
  ScheduleCapacityActionValues,
} from "@/lib/admin/events/bases-action/shared.server";

const scheduleCapacityFieldNames = ["id", "groupType", "capacity"] as const;
const submodalityFieldNames = ["id", "name"] as const;

export function readEventBasesActionInput(
  eventId: string,
  formData: FormData,
): EventBasesActionInput {
  return {
    confirmDelete:
      String(formData.get("confirmDelete") ?? "") === "1" ||
      String(formData.get("confirmDelete") ?? "") === "on" ||
      String(formData.get("confirmDelete") ?? "") === "yes",
    confirmDeletion: String(formData.get("confirmDeletion") ?? ""),
    eventId,
    capacity: Number.parseInt(String(formData.get("capacity") ?? ""), 10),
    id: String(formData.get("id") ?? ""),
    intent: String(formData.get("intent") ?? ""),
    minAge: Number(formData.get("minAge")),
    maxAge: Number(formData.get("maxAge")),
    groupTypes: formData.getAll("groupTypes").map(String),
    groupType: String(formData.get("groupType") ?? ""),
    isSpecialPrice: String(formData.get("isSpecialPrice") ?? "") === "true",
    modalityIds: formData.getAll("modalityIds").map(String),
    modalityId: String(formData.get("modalityId") ?? ""),
    name: String(formData.get("name") ?? ""),
    scheduleId: String(formData.get("scheduleId") ?? ""),
    priceScheduleId: String(formData.get("scheduleId") ?? "") || null,
    paymentDeadline: String(formData.get("paymentDeadline") ?? ""),
    experienceLevelIds: formData.getAll("experienceLevelIds").map(String),
    scheduledDate: String(formData.get("scheduledDate") ?? ""),
    startTime: String(formData.get("startTime") ?? ""),
    totalCapacity: Number.parseInt(
      String(formData.get("totalCapacity") ?? ""),
      10,
    ),
    amount: Number.parseInt(String(formData.get("amount") ?? ""), 10),
    scheduleCapacities: readScheduleCapacitiesInput(formData),
    submodalities: readSubmodalitiesInput(formData),
    submodalitiesMode: String(formData.get("submodalitiesMode") ?? ""),
  };
}

export function readNameActionValues(formData: FormData): NameActionValues {
  return {
    name: String(formData.get("name") ?? ""),
  };
}

export function readScheduleCapacityActionValues(
  formData: FormData,
): ScheduleCapacityActionValues {
  return {
    groupType: String(formData.get("groupType") ?? ""),
    capacity: String(formData.get("capacity") ?? ""),
  };
}

export function readScheduleCapacityActionValuesList(formData: FormData) {
  return readIndexedFormEntries({
    formData,
    prefix: "scheduleCapacities",
    fieldNames: scheduleCapacityFieldNames,
    createEntry: (): ScheduleCapacityActionValues => ({
      groupType: "",
      capacity: "",
    }),
    setField: (entry, fieldName, value) => {
      if (fieldName === "id" && value.trim().length > 0) {
        entry.id = value;
      }

      if (fieldName === "groupType") {
        entry.groupType = value;
      }

      if (fieldName === "capacity") {
        entry.capacity = value;
      }
    },
  });
}

export function readSubmodalitiesInput(formData: FormData) {
  return readIndexedFormEntries({
    formData,
    prefix: "submodalities",
    fieldNames: submodalityFieldNames,
    createEntry: (): NameActionValuesWithId => ({ name: "" }),
    setField: (entry, fieldName, value) => {
      if (fieldName === "id" && value.trim().length > 0) {
        entry.id = value;
      }

      if (fieldName === "name") {
        entry.name = value;
      }
    },
  });
}

function readScheduleCapacitiesInput(formData: FormData) {
  return readIndexedFormEntries({
    formData,
    prefix: "scheduleCapacities",
    fieldNames: scheduleCapacityFieldNames,
    createEntry: (): ScheduleCapacityInputWithOptionalId => ({
      groupType: "",
      capacity: Number.NaN,
    }),
    setField: (entry, fieldName, value) => {
      if (fieldName === "id" && value.trim().length > 0) {
        entry.id = value;
      }

      if (fieldName === "groupType") {
        entry.groupType = value;
      }

      if (fieldName === "capacity") {
        entry.capacity = Number.parseInt(value, 10);
      }
    },
  });
}

type ScheduleCapacityInputWithOptionalId = {
  id?: string;
  groupType: string;
  capacity: number;
};

function readIndexedFormEntries<FieldName extends string, Entry>({
  formData,
  prefix,
  fieldNames,
  createEntry,
  setField,
}: {
  formData: FormData;
  prefix: string;
  fieldNames: readonly FieldName[];
  createEntry: () => Entry;
  setField: (entry: Entry, fieldName: FieldName, value: string) => void;
}) {
  const entriesByIndex = new Map<number, Entry>();

  for (const [key, value] of formData.entries()) {
    const field = getIndexedFormField(key, prefix, fieldNames);

    if (!field || typeof value !== "string") {
      continue;
    }

    const entry = entriesByIndex.get(field.index) ?? createEntry();

    setField(entry, field.fieldName, value);
    entriesByIndex.set(field.index, entry);
  }

  return Array.from(entriesByIndex.entries())
    .sort(([firstIndex], [secondIndex]) => firstIndex - secondIndex)
    .map(([, entry]) => entry);
}

function getIndexedFormField<FieldName extends string>(
  key: string,
  prefix: string,
  fieldNames: readonly FieldName[],
): { index: number; fieldName: FieldName } | null {
  const [entryPrefix, indexValue, fieldName, ...extraSegments] = key.split(".");

  if (
    entryPrefix !== prefix ||
    extraSegments.length > 0 ||
    !indexValue ||
    !/^\d+$/.test(indexValue)
  ) {
    return null;
  }

  const matchedFieldName = fieldNames.find((name) => name === fieldName);

  if (!matchedFieldName) {
    return null;
  }

  return {
    index: Number.parseInt(indexValue, 10),
    fieldName: matchedFieldName,
  };
}

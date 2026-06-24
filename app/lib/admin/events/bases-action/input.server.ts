import type {
  EventBasesActionInput,
  NameActionValues,
  NameActionValuesWithId,
  ScheduleCapacityActionValues,
} from "@/lib/admin/events/bases-action/shared.server";

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
    newExperienceLevelName: String(
      formData.get("newExperienceLevelName") ?? "",
    ),
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
  const entriesByIndex = new Map<
    number,
    { id?: string; groupType: string; capacity: string }
  >();

  for (const [key, value] of formData.entries()) {
    const match = /^scheduleCapacities\.(\d+)\.(id|groupType|capacity)$/.exec(
      key,
    );

    if (!match || typeof value !== "string") {
      continue;
    }

    const index = Number.parseInt(match[1] ?? "", 10);
    const fieldName = match[2];
    const entry = entriesByIndex.get(index) ?? {
      groupType: "",
      capacity: "",
    };

    if (fieldName === "id" && value.trim().length > 0) {
      entry.id = value;
    }

    if (fieldName === "groupType") {
      entry.groupType = value;
    }

    if (fieldName === "capacity") {
      entry.capacity = value;
    }

    entriesByIndex.set(index, entry);
  }

  return Array.from(entriesByIndex.entries())
    .sort(([firstIndex], [secondIndex]) => firstIndex - secondIndex)
    .map(([, entry]) => entry);
}

export function readSubmodalitiesInput(formData: FormData) {
  const entriesByIndex = new Map<number, { id?: string; name: string }>();

  for (const [key, value] of formData.entries()) {
    const match = /^submodalities\.(\d+)\.(id|name)$/.exec(key);

    if (!match || typeof value !== "string") {
      continue;
    }

    const index = Number.parseInt(match[1] ?? "", 10);
    const fieldName = match[2];
    const entry = entriesByIndex.get(index) ?? { name: "" };

    if (fieldName === "id" && value.trim().length > 0) {
      entry.id = value;
    }

    if (fieldName === "name") {
      entry.name = value;
    }

    entriesByIndex.set(index, entry);
  }

  return Array.from(entriesByIndex.entries())
    .sort(([firstIndex], [secondIndex]) => firstIndex - secondIndex)
    .map(([, entry]) => entry);
}

function readScheduleCapacitiesInput(formData: FormData) {
  const entriesByIndex = new Map<
    number,
    { id?: string; groupType: string; capacity: number }
  >();

  for (const [key, value] of formData.entries()) {
    const match = /^scheduleCapacities\.(\d+)\.(id|groupType|capacity)$/.exec(
      key,
    );

    if (!match || typeof value !== "string") {
      continue;
    }

    const index = Number.parseInt(match[1] ?? "", 10);
    const fieldName = match[2];
    const entry = entriesByIndex.get(index) ?? {
      groupType: "",
      capacity: Number.NaN,
    };

    if (fieldName === "id" && value.trim().length > 0) {
      entry.id = value;
    }

    if (fieldName === "groupType") {
      entry.groupType = value;
    }

    if (fieldName === "capacity") {
      entry.capacity = Number.parseInt(value, 10);
    }

    entriesByIndex.set(index, entry);
  }

  return Array.from(entriesByIndex.entries())
    .sort(([firstIndex], [secondIndex]) => firstIndex - secondIndex)
    .map(([, entry]) => entry);
}

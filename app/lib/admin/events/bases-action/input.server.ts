import type { EventBasesActionBaseInput } from "@/lib/admin/events/bases-action/shared.server";

export function readEventBasesActionBaseInput(
  eventId: string,
  formData: FormData,
): EventBasesActionBaseInput {
  return {
    confirmDelete:
      String(formData.get("confirmDelete") ?? "") === "1" ||
      String(formData.get("confirmDelete") ?? "") === "on" ||
      String(formData.get("confirmDelete") ?? "") === "yes",
    confirmDeletion: String(formData.get("confirmDeletion") ?? ""),
    eventId,
    id: String(formData.get("id") ?? ""),
    intent: String(formData.get("intent") ?? ""),
  };
}

export function readIndexedFormEntries<FieldName extends string, Entry>({
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

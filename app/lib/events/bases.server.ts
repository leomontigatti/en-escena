import {
  listEventBasesData,
  resolveApplicablePrice,
  resolveCompatibleScheduleEntries,
  type CompatibleScheduleEntry,
  type CompatibleScheduleEntryResolution,
  type PriceListItem,
  type PriceResolutionResult,
  type ScheduleBlockListItem,
} from "@/lib/events/bases-repository.server";

export type {
  CompatibleScheduleEntry,
  CompatibleScheduleEntryResolution,
  PriceListItem,
  PriceResolutionResult,
  ScheduleBlockListItem,
};

export async function getEventBases(eventId: string) {
  return listEventBasesData(eventId);
}

export type EventBases = Awaited<ReturnType<typeof getEventBases>>;

export type ChoreographyRegistrationBaseOptions = {
  modalities: Array<{ id: string; name: string }>;
  submodalities: Array<{ id: string; name: string; modalityId: string }>;
};

export function getChoreographyRegistrationBaseOptions(
  eventBases: EventBases,
): ChoreographyRegistrationBaseOptions {
  return {
    modalities: eventBases.modalities.map((modality) => ({
      id: modality.id,
      name: modality.name,
    })),
    submodalities: eventBases.submodalities.map((submodality) => ({
      id: submodality.id,
      name: submodality.name,
      modalityId: submodality.modalityId,
    })),
  };
}

export async function resolveEventBasesPrice(input: {
  eventId: string;
  groupType: string;
  scheduleBlockId: string | null;
}): Promise<PriceResolutionResult> {
  return resolveApplicablePrice(input);
}

export async function resolveEventBasesScheduleOptions(input: {
  eventId: string;
  modalityId: string;
  groupType: string;
}): Promise<CompatibleScheduleEntryResolution> {
  return resolveCompatibleScheduleEntries(input);
}

import {
  listChoreographyRegistrationInitialOptions,
  listEventBasesData,
  resolveApplicablePrice,
  resolveCompatibleScheduleCapacities,
  type CompatibleScheduleCapacity,
  type CompatibleScheduleCapacityResolution,
  type PriceListItem,
  type PriceResolutionResult,
  type ScheduleListItem,
} from "@/lib/events/bases-repository.server";

export type {
  CompatibleScheduleCapacity,
  CompatibleScheduleCapacityResolution,
  PriceListItem,
  PriceResolutionResult,
  ScheduleListItem,
};

export async function getEventBases(eventId: string) {
  return listEventBasesData(eventId);
}

export type EventBases = Awaited<ReturnType<typeof getEventBases>>;

export type ChoreographyRegistrationBaseOptions = {
  modalities: Array<{ id: string; name: string }>;
  submodalities: Array<{ id: string; name: string; modalityId: string }>;
};

export async function getChoreographyRegistrationInitialOptions(
  eventId: string,
): Promise<ChoreographyRegistrationBaseOptions> {
  return listChoreographyRegistrationInitialOptions(eventId);
}

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
  scheduleId: string | null;
}): Promise<PriceResolutionResult> {
  return resolveApplicablePrice(input);
}

export async function resolveEventBasesScheduleOptions(input: {
  eventId: string;
  modalityId: string;
  groupType: string;
}): Promise<CompatibleScheduleCapacityResolution> {
  return resolveCompatibleScheduleCapacities(input);
}

import {
  listChoreographyRegistrationBaseOptionsData,
  listModalities,
  listSubmodalities,
} from "@/lib/modalities/repository.server";
import { listCategories } from "@/lib/categories/repository.server";
import {
  listPrices,
  resolveApplicablePrice,
  type PriceListItem,
  type PriceResolutionResult,
} from "@/lib/prices/repository.server";
import {
  listSchedules,
  resolveCompatibleScheduleCapacities,
  type CompatibleScheduleCapacity,
  type CompatibleScheduleCapacityResolution,
  type ScheduleListItem,
} from "@/lib/schedules/repository.server";

export type {
  CompatibleScheduleCapacity,
  CompatibleScheduleCapacityResolution,
  PriceListItem,
  PriceResolutionResult,
  ScheduleListItem,
};

export async function getEventBases(eventId: string) {
  const [modalities, submodalities, categories, schedules, prices] =
    await Promise.all([
      listModalities(eventId),
      listSubmodalities(eventId),
      listCategories(eventId),
      listSchedules(eventId),
      listPrices(eventId),
    ]);

  return {
    modalities,
    submodalities,
    categories,
    schedules,
    prices,
  };
}

export type EventBases = Awaited<ReturnType<typeof getEventBases>>;

export type ChoreographyRegistrationBaseOptions = {
  modalities: Array<{ id: string; name: string }>;
  submodalities: Array<{ id: string; name: string; modalityId: string }>;
};

export async function getChoreographyRegistrationInitialOptions(
  eventId: string,
): Promise<ChoreographyRegistrationBaseOptions> {
  return listChoreographyRegistrationBaseOptionsData(eventId);
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

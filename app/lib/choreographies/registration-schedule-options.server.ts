import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import { withScheduleCapacityOccupancy } from "@/lib/choreographies/schedule-capacity-options.server";
import type {
  CompatibleScheduleCapacity,
  CompatibleScheduleCapacityResolution,
} from "@/lib/events/bases.server";
import { findOpenScheduleIds } from "@/lib/schedules/registration-open.server";

type ScheduleOptionSummary = Pick<
  CompatibleScheduleCapacity,
  | "id"
  | "scheduleId"
  | "scheduleCapacityId"
  | "capacity"
  | "groupType"
  | "usesGlobalCapacity"
> & {
  schedule: CompatibleScheduleCapacity["schedule"];
};

/**
 * Only the options the portal offers as a list carry occupancy: with a single
 * compatible capacity there is no select to choose from, and the label of the
 * already assigned schedule does not say how many places are left.
 */
type ScheduleCapacityChoice = ScheduleOptionSummary & {
  isFull: boolean;
  label: string;
};

export type ScheduleResolution =
  | {
      status: "none";
      canConfirm: false;
      error: string;
      options: [];
    }
  | {
      status: "auto";
      canConfirm: true;
      scheduleCapacityId: string;
      options: [ScheduleOptionSummary];
    }
  | {
      status: "multiple";
      canConfirm: true;
      options: ScheduleCapacityChoice[];
    };

/**
 * The schedules a registration may be confirmed into, out of the ones the bases
 * found compatible. `null` is the portal's closed path: every compatible
 * `Cronograma` has its inscriptions closed, which the caller refuses naming the
 * path instead of reporting the "no compatible schedule" of bases that never
 * took the combination.
 *
 * `onlyOpen` is what separates the two audiences: the portal is bound by the
 * switch, administration re-resolves a choreography it already owns and keeps
 * seeing every compatible schedule.
 */
export async function resolveOfferedScheduleOptions(input: {
  eventId: string;
  onlyOpen: boolean;
  compatibleScheduleCapacities: CompatibleScheduleCapacityResolution;
}): Promise<ScheduleResolution | null> {
  const offered = input.onlyOpen
    ? await withOpenSchedulesOnly(
        input.eventId,
        input.compatibleScheduleCapacities,
      )
    : input.compatibleScheduleCapacities;

  if (!offered) {
    return null;
  }

  return mapScheduleResolution(offered);
}

async function withOpenSchedulesOnly(
  eventId: string,
  resolution: CompatibleScheduleCapacityResolution,
): Promise<CompatibleScheduleCapacityResolution | null> {
  if (resolution.status === "none") {
    return resolution;
  }

  const openScheduleIds = await findOpenScheduleIds(eventId);
  const [firstOption, ...restOptions] = resolution.options.filter((option) =>
    openScheduleIds.has(option.scheduleId),
  );

  if (!firstOption) {
    return null;
  }

  if (restOptions.length === 0) {
    return {
      status: "auto",
      scheduleCapacity: firstOption,
      options: [firstOption],
    };
  }

  return {
    status: "multiple",
    options: [firstOption, ...restOptions],
  };
}

async function mapScheduleResolution(
  scheduleResolution: CompatibleScheduleCapacityResolution,
): Promise<ScheduleResolution> {
  if (scheduleResolution.status === "none") {
    return {
      status: "none",
      canConfirm: false,
      error: scheduleResolution.error,
      options: [],
    };
  }

  if (scheduleResolution.status === "auto") {
    return {
      status: "auto",
      canConfirm: true,
      scheduleCapacityId: scheduleResolution.scheduleCapacity.id,
      options: [toScheduleOptionSummary(scheduleResolution.scheduleCapacity)],
    };
  }

  return {
    status: "multiple",
    canConfirm: true,
    // The same options with occupancy that administration sees: the label is built
    // by the shared builder so the two surfaces do not diverge.
    options: await withScheduleCapacityOccupancy({
      options: scheduleResolution.options.map((option) => ({
        ...toScheduleOptionSummary(option),
        label: formatScheduleDateTime(option.schedule),
      })),
    }),
  };
}

function toScheduleOptionSummary(
  option: CompatibleScheduleCapacity,
): ScheduleOptionSummary {
  return {
    id: option.id,
    scheduleId: option.scheduleId,
    scheduleCapacityId: option.scheduleCapacityId,
    capacity: option.capacity,
    groupType: option.groupType,
    usesGlobalCapacity: option.usesGlobalCapacity,
    schedule: option.schedule,
  };
}

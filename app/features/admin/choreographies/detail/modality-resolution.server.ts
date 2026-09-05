import { db } from "@/db";
import { resolveChoreographyClassificationForResolvedDancers } from "@/lib/choreographies/registration-resolution.server";
import { invalidScheduleEntryMessage } from "@/lib/choreographies/schedule-capacity-lock.server";
import type { ScheduleCapacitySelectOption } from "@/lib/choreographies/schedule-capacity-options";
import {
  isScheduleCapacityFull,
  withScheduleCapacityOccupancy,
} from "@/lib/choreographies/schedule-capacity-options.server";
import {
  formatScheduleDateTime,
  type ScheduleDateTimeInput,
} from "@/lib/choreographies/schedule-formatters";
import {
  getEventBases,
  resolveEventBasesScheduleOptions,
} from "@/lib/events/bases.server";
import {
  loadPriceDivergenceCheck,
  partitionPriceDivergentOptions,
} from "@/lib/finances/choreography-price-divergence-guard.server";

import type { ChoreographyDetail } from "./server";

type ResolvedModalityScheduleOption = {
  id: string;
  schedule: ScheduleDateTimeInput;
  scheduleCapacityId: string | null;
  scheduleId: string;
};

/**
 * The lone capacity of the `auto` status, with no `label` at all — the same
 * shape registration gives its own non-choice in `ScheduleOptionSummary`. It
 * arrives preselected and read-only, so there is no label for occupancy to get
 * wrong: the view formats the bare date-time itself.
 *
 * `isFull` stays, unlike registration's summary: a lone full capacity is the
 * dead end the administrative view explains instead of previewing.
 */
export type ChoreographyModalityLockedScheduleCapacity = {
  id: string;
  isFull: boolean;
  schedule: ScheduleDateTimeInput;
};

/**
 * Only `multiple` carries labels, and therefore occupancy. The rule is the
 * type's, not the data's: there is no `auto` label to strip because there is
 * none to build.
 */
export type ChoreographyModalityScheduleCapacityResolution =
  | { options: []; status: "none" }
  | { options: [ChoreographyModalityLockedScheduleCapacity]; status: "auto" }
  | { options: ScheduleCapacitySelectOption[]; status: "multiple" };

type ModalityCorrectionContext = {
  classification: ReturnType<
    typeof resolveChoreographyClassificationForResolvedDancers
  >;
  /**
   * The capacities compatible with the destination modality that were left out
   * because they would reprice a money-holding inscription. The save re-derives
   * its reason from them: an id the preview offered before an allocation landed
   * is a price problem, not an invalid selection.
   */
  priceDivergentScheduleOptionIds: string[];
  /** What the preview shows, already shaped for the view. */
  scheduleCapacity: ChoreographyModalityScheduleCapacityResolution;
  /** What the save locks against: ids alone, no labels involved. */
  scheduleOptions: ResolvedModalityScheduleOption[];
  submodalityOptions: Array<{ id: string; name: string }>;
};

/**
 * The deposit rejection names the modality instead of reusing
 * `priceDivergenceScheduleCapacityMessage`, which names the capacity: the
 * administrator did not touch the capacity select here, and pointing at it
 * would send them to the wrong field.
 */
export const priceDivergenceModalityMessage =
  "No se puede cambiar la modalidad: el cronograma se movería y cambiaría el precio de inscripciones con dinero asignado.";

export async function resolveModalityCorrectionContext(input: {
  choreography: ChoreographyDetail;
  eventBases: Awaited<ReturnType<typeof getEventBases>>;
  eventId: string;
  modalityId: string;
}): Promise<ModalityCorrectionContext> {
  const classification = resolveChoreographyClassificationForResolvedDancers({
    dancers: input.choreography.dancers,
    eventBases: input.eventBases,
    modalityId: input.modalityId,
  });
  const [scheduleResolution, diverges] = await Promise.all([
    resolveEventBasesScheduleOptions({
      eventId: input.eventId,
      groupType: classification.groupType,
      modalityId: input.modalityId,
    }),
    loadPriceDivergenceCheck({
      choreographyId: input.choreography.id,
      executor: db,
    }),
  ]);
  // The same omission the standalone reassignment makes, for the same reason: a
  // capacity that would reprice a money-holding inscription is one the save
  // refuses, and greying it would show a disabled option whose own label says
  // it has room.
  //
  // Priced against the **stored** group type, not the classification's, even
  // though compatibility above is resolved against the classification's: the
  // correction writes no `group_type`, so the price key the move lands on keeps
  // the one the column already holds — and it is the one the guard inside the
  // transaction asks about. Reading the two from different sources would let
  // the offered set and the guard disagree wherever they drift, which is the
  // one thing this filter exists to prevent.
  const { divergentIds, selectable: selectableOptions } =
    partitionPriceDivergentOptions({
      assignedOptionId: input.choreography.scheduleCapacityId,
      diverges,
      groupType: input.choreography.groupType,
      options: scheduleResolution.options,
    });

  // Read off what survived the price filter rather than carried over from the
  // resolution: a modality left with a single holding-the-price capacity is
  // `auto`, and one left with none is the dead end the view replaces with its
  // reason.
  const scheduleOptions = selectableOptions.map((option) => ({
    id: option.id,
    schedule: option.schedule,
    scheduleCapacityId: option.scheduleCapacityId,
    scheduleId: option.scheduleId,
  }));

  return {
    classification,
    priceDivergentScheduleOptionIds: divergentIds,
    scheduleCapacity: await toModalityScheduleCapacityResolution({
      // Same exclusion as the lock: the choreography being corrected does not
      // count against the capacity it already occupies.
      excludeChoreographyId: input.choreography.id,
      options: scheduleOptions,
    }),
    scheduleOptions,
    submodalityOptions: input.eventBases.submodalities
      .filter((submodality) => submodality.modalityId === input.modalityId)
      .map((submodality) => ({ id: submodality.id, name: submodality.name })),
  };
}

/**
 * Why the correction names no capacity of the destination modality. A capacity
 * omitted for its price is *absent* from the set rather than invalid, so the
 * reason is re-derived instead of sending the administrator to a field they did
 * not get wrong; and when the omissions emptied the set the select was replaced
 * by its dead-end alert, so the form carries no id at all and the price is
 * still the reason.
 */
export function toMissingScheduleMessage(input: {
  context: ModalityCorrectionContext;
  requestedScheduleOptionId: string | null;
}) {
  const divergentIds = input.context.priceDivergentScheduleOptionIds;

  // The select was replaced by its dead-end alert, so the form carries no id at
  // all and the omissions are the only account of why there was nothing to send.
  if (input.context.scheduleOptions.length === 0) {
    return divergentIds.length > 0
      ? priceDivergenceModalityMessage
      : invalidScheduleEntryMessage;
  }

  if (
    input.requestedScheduleOptionId !== null &&
    divergentIds.includes(input.requestedScheduleOptionId)
  ) {
    return priceDivergenceModalityMessage;
  }

  return invalidScheduleEntryMessage;
}

/**
 * The rule registration writes into its own resolution type, held here by the
 * type as well: only `multiple` has labels, so only `multiple` builds
 * occupancy. `auto` offers no options to pick between —its lone capacity
 * arrives preselected and read-only, where saying how many places are left
 * means nothing—, so it goes back with the bare schedule the view formats.
 *
 * `isFull` is still read for that lone capacity, through the same module that
 * builds the occupancy of the labelled ones: a full one is the dead end the
 * view explains instead of previewing.
 */
async function toModalityScheduleCapacityResolution(input: {
  excludeChoreographyId: string;
  options: ResolvedModalityScheduleOption[];
}): Promise<ChoreographyModalityScheduleCapacityResolution> {
  const [preselected] = input.options;

  if (!preselected) {
    return { options: [], status: "none" };
  }

  if (input.options.length === 1) {
    return {
      options: [
        {
          id: preselected.id,
          isFull: await isScheduleCapacityFull({
            excludeChoreographyId: input.excludeChoreographyId,
            target: preselected,
          }),
          // Narrowed to what the view formats: the schedule row this came
          // from crosses to the browser otherwise, `id` and all.
          schedule: {
            name: preselected.schedule.name,
            scheduledDate: preselected.schedule.scheduledDate,
            startTime: preselected.schedule.startTime,
          },
        },
      ],
      status: "auto",
    };
  }

  const options = await withScheduleCapacityOccupancy({
    excludeChoreographyId: input.excludeChoreographyId,
    options: input.options.map((option) => ({
      ...option,
      label: formatScheduleDateTime(option.schedule),
    })),
  });

  return {
    options: options.map((option) => ({
      id: option.id,
      isFull: option.isFull,
      label: option.label,
    })),
    status: "multiple",
  };
}

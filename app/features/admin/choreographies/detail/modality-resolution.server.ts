import { db } from "@/db";
import { resolveChoreographyClassificationForResolvedDancers } from "@/lib/choreographies/registration-resolution.server";
import { invalidScheduleEntryMessage } from "@/lib/choreographies/schedule-capacity-lock.server";
import type { ScheduleCapacitySelectOption } from "@/lib/choreographies/schedule-capacity-options";
import { withScheduleCapacityOccupancy } from "@/lib/choreographies/schedule-capacity-options.server";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import {
  getEventBases,
  resolveEventBasesScheduleOptions,
} from "@/lib/events/bases.server";
import {
  loadPriceDivergenceCheck,
  partitionPriceDivergentOptions,
} from "@/lib/finances/choreography-price-divergence-guard.server";

import type { ChoreographyDetail } from "./server";

type ResolvedModalityScheduleOption = ScheduleCapacitySelectOption & {
  scheduleCapacityId: string | null;
  scheduleId: string;
};

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
  scheduleOptions: ResolvedModalityScheduleOption[];
  scheduleStatus: "auto" | "multiple" | "none";
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

  const bareLabeledOptions = selectableOptions.map((option) => ({
    id: option.id,
    label: formatScheduleDateTime(option.schedule),
    scheduleCapacityId: option.scheduleCapacityId,
    scheduleId: option.scheduleId,
  }));
  const occupancyLabeledOptions = await withScheduleCapacityOccupancy({
    // Same exclusion as the lock: the choreography being corrected does not
    // count against the capacity it already occupies.
    excludeChoreographyId: input.choreography.id,
    options: bareLabeledOptions,
  });
  // Read off what survived rather than carried over from the resolution: a
  // modality left with a single holding-the-price capacity is `auto`, and one
  // left with none is the dead end the view replaces with its reason.
  const scheduleStatus = toScheduleCapacityStatus(selectableOptions.length);

  return {
    classification,
    priceDivergentScheduleOptionIds: divergentIds,
    scheduleOptions: withoutOccupancyOnThePreselectedCapacity({
      bareLabel: bareLabeledOptions[0]?.label,
      occupancyLabeled: occupancyLabeledOptions,
      status: scheduleStatus,
    }),
    scheduleStatus,
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
 * The rule registration writes into its own resolution type: only `multiple`
 * carries a label with occupancy. `auto` offers no options to pick between —
 * its lone capacity arrives preselected and read-only, where saying how many
 * places are left means nothing —, so it goes back to the bare date-time label.
 *
 * Keyed on the status the view itself reads, not on a second count of the same
 * options, so the preview and the lock cannot drift apart; `auto` is exactly one
 * option, which is why only the first is read. `isFull` still comes from the
 * occupancy read: a lone full capacity is the dead end the view explains.
 */
function withoutOccupancyOnThePreselectedCapacity<
  TOption extends { label: string },
>(input: {
  bareLabel: string | undefined;
  occupancyLabeled: TOption[];
  status: ReturnType<typeof toScheduleCapacityStatus>;
}) {
  const [preselected] = input.occupancyLabeled;

  if (
    input.status !== "auto" ||
    !preselected ||
    input.bareLabel === undefined
  ) {
    return input.occupancyLabeled;
  }

  return [{ ...preselected, label: input.bareLabel }];
}

/**
 * The same three states `resolveCompatibleScheduleCapacities` reports, recomputed
 * over the capacities that survived the price filter: nothing to choose, one
 * that arrives preselected, or a real choice.
 */
function toScheduleCapacityStatus(count: number) {
  if (count === 0) {
    return "none" as const;
  }

  return count === 1 ? ("auto" as const) : ("multiple" as const);
}

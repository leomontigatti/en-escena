import { db } from "@/db";
import { getGlobalScheduleCapacityOptionId } from "@/lib/choreographies/choreography-roster.shared";
import {
  invalidScheduleEntryMessage,
  priceDivergenceScheduleCapacityMessage,
} from "@/lib/choreographies/schedule-capacity-lock.server";
import {
  isScheduleCapacityFull,
  withScheduleCapacityOccupancy,
} from "@/lib/choreographies/schedule-capacity-options.server";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import { resolveEventBasesScheduleOptions } from "@/lib/events/bases.server";
import {
  loadPriceDivergenceCheck,
  partitionPriceDivergentOptions,
} from "@/lib/finances/choreography-price-divergence-guard.server";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

import type { ChoreographyDetail } from "./choreography-queries.server";
import type { ChoreographyDraft } from "./draft.shared";
import type { ChoreographyScheduleCapacityBlocker } from "./shared";

const everyScheduleCapacityFullMessage =
  "No se puede guardar: todos los cupos de cronograma compatibles están llenos.";

/** A capacity the draft can land on, with what the lock needs to place it. */
export type DraftScheduleOption = {
  /** The date and time alone, for the confirmation. */
  bareLabel: string;
  id: string;
  isFull: boolean;
  /** What the select offers, with occupancy when there is a choice to make. */
  label: string;
  scheduleCapacityId: string | null;
  scheduleId: string;
};

/**
 * The capacities the draft may land on. While the classification stands, the
 * one assigned today stays offered even if it drifted out of compatibility, so
 * it is never replaced behind the administrator's back; once the
 * classification moves, only compatible capacities count.
 */
export async function resolveDraftScheduleOptions(input: {
  categoryId: string;
  choreography: ChoreographyDetail;
  classificationChanged: boolean;
  eventId: string;
  groupType: ChoreographyGroupType;
  modalityId: string;
}): Promise<{
  divergentIds: string[];
  options: DraftScheduleOption[];
  reason: string | null;
}> {
  const [compatible, diverges] = await Promise.all([
    resolveEventBasesScheduleOptions({
      categoryId: input.categoryId,
      eventId: input.eventId,
      groupType: input.groupType,
      modalityId: input.modalityId,
    }),
    loadPriceDivergenceCheck({
      choreographyId: input.choreography.id,
      executor: db,
    }),
  ]);
  const candidates = compatible.options.map((option) => {
    const label = formatScheduleDateTime(option.schedule);

    return {
      bareLabel: label,
      id: option.id,
      label,
      scheduleCapacityId: option.scheduleCapacityId,
      scheduleId: option.scheduleId,
    };
  });
  // Priced against the draft's group type, as the guard at save prices it. The
  // assigned capacity is exempt: staying put moves no schedule, so a change of
  // group type alone is left unguarded, the domain's known gap.
  const { divergentIds, selectable } = partitionPriceDivergentOptions({
    assignedOptionId: input.choreography.scheduleCapacityId,
    diverges,
    groupType: input.groupType,
    options: candidates,
  });

  if (
    !input.classificationChanged &&
    !selectable.some(
      (option) => option.id === input.choreography.scheduleCapacityId,
    )
  ) {
    const { isFull: _isFull, ...assigned } = toAssignedScheduleOption(
      input.choreography,
    );
    selectable.push(assigned);
  }

  if (selectable.length === 0) {
    return {
      divergentIds,
      options: [],
      reason:
        divergentIds.length > 0
          ? priceDivergenceScheduleCapacityMessage
          : compatible.status === "none"
            ? compatible.error
            : invalidScheduleEntryMessage,
    };
  }

  const options = await withDraftOccupancy({
    choreography: input.choreography,
    options: selectable,
  });

  return {
    divergentIds,
    options,
    reason: options.every((option) => option.isFull)
      ? everyScheduleCapacityFullMessage
      : null,
  };
}

/**
 * Occupancy labels only a real choice: a lone capacity arrives preselected and
 * read-only, where how many places are left means nothing. The capacity the
 * choreography holds is never full to itself.
 */
async function withDraftOccupancy(input: {
  choreography: ChoreographyDetail;
  options: Array<Omit<DraftScheduleOption, "isFull">>;
}): Promise<DraftScheduleOption[]> {
  const [lone] = input.options;

  if (input.options.length === 1 && lone) {
    return [
      {
        ...lone,
        isFull:
          lone.id !== input.choreography.scheduleCapacityId &&
          (await isScheduleCapacityFull({
            excludeChoreographyId: input.choreography.id,
            target: lone,
          })),
      },
    ];
  }

  const labelled = await withScheduleCapacityOccupancy({
    excludeChoreographyId: input.choreography.id,
    options: input.options,
  });

  return labelled.map((option) => ({
    ...option,
    isFull:
      option.id !== input.choreography.scheduleCapacityId && option.isFull,
  }));
}

/**
 * The draft's own pick while it is still offered, then the capacity held today
 * while it still fits, then the only one there is. Otherwise the choice is the
 * administrator's.
 */
export function selectDraftScheduleOption(input: {
  choreography: ChoreographyDetail;
  draft: ChoreographyDraft;
  options: DraftScheduleOption[];
}): DraftScheduleOption | null {
  const offered = (id: string) =>
    input.options.find((option) => option.id === id && !option.isFull);
  const [lone] = input.options;

  return (
    offered(input.draft.scheduleCapacityId) ??
    offered(input.choreography.scheduleCapacityId) ??
    (input.options.length === 1 && lone && !lone.isFull ? lone : null)
  );
}

export function toAssignedScheduleOption(
  choreography: ChoreographyDetail,
): DraftScheduleOption {
  const isGlobalOption =
    choreography.scheduleCapacityId ===
    getGlobalScheduleCapacityOptionId(choreography.scheduleId);

  return {
    bareLabel: choreography.scheduleLabel,
    id: choreography.scheduleCapacityId,
    isFull: false,
    label: choreography.scheduleLabel,
    scheduleCapacityId: isGlobalOption ? null : choreography.scheduleCapacityId,
    scheduleId: choreography.scheduleId,
  };
}

/**
 * The filter left something to choose from. Not phrased as a block, because
 * nothing is blocked: the select is open and every destination in it holds the
 * price. It names no destination and no amount — the select is already the
 * list, and an enumeration in an alert would go stale the moment a price row
 * or an allocation moves.
 */
const priceFilteredOptionsBlocker: ChoreographyScheduleCapacityBlocker = {
  code: "price-filtered-options",
  label:
    "Hay inscripciones con dinero asignado, así que solo se ofrecen los cronogramas que mantienen el precio.",
};

/**
 * The filter left nothing to choose from, so the field fell back to read-only.
 * Without this the administrator sees a locked select and no reason at all: the
 * omitted destinations explain themselves nowhere else.
 */
const noPricePreservingOptionBlocker: ChoreographyScheduleCapacityBlocker = {
  code: "no-price-preserving-option",
  label:
    "No se puede reasignar el cupo de cronograma: hay inscripciones con dinero asignado y no hay cronogramas alternativos que mantengan el precio.",
};

/**
 * What the page's alert reads out about the price, chosen from the options that
 * survived the filter and not from a blanket money read: money no destination
 * would reprice omits nothing and is announced nowhere. It is not filtered by
 * role — the auditor also has to see why the select is narrower, or closed.
 */
export function toScheduleCapacityBlockers(input: {
  hasPriceDivergentOption: boolean;
  hasSelectableAlternative: boolean;
}): ChoreographyScheduleCapacityBlocker[] {
  if (!input.hasPriceDivergentOption) {
    return [];
  }

  return [
    input.hasSelectableAlternative
      ? priceFilteredOptionsBlocker
      : noPricePreservingOptionBlocker,
  ];
}

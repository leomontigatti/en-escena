import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import { getGlobalScheduleCapacityOptionId } from "@/lib/choreographies/choreography-roster.shared";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import {
  frozenPriceScheduleCapacityMessage,
  guardAndLockScheduleCapacityMove,
  invalidScheduleEntryMessage,
} from "@/lib/choreographies/schedule-capacity-lock.server";
import type { ScheduleCapacitySelectOption } from "@/lib/choreographies/schedule-capacity-options";
import { withScheduleCapacityOccupancy } from "@/lib/choreographies/schedule-capacity-options.server";
import { resolveEventBasesScheduleOptions } from "@/lib/events/bases.server";
import { loadPriceDivergenceCheck } from "@/lib/finances/choreography-frozen-price-guard.server";

import type { ChoreographyDetail } from "./server";
import {
  assignedScheduleCapacityFieldName,
  choreographySavedSuccess,
  type ChoreographyFieldUpdateErrorData,
  type ChoreographyScheduleCapacityBlocker,
  type ChoreographySuccessData,
} from "./shared";

export type ChoreographyScheduleCapacityOption = ScheduleCapacitySelectOption;

export type ChoreographyScheduleCapacityReassignment = {
  blockers: ChoreographyScheduleCapacityBlocker[];
  canReassign: boolean;
  options: ChoreographyScheduleCapacityOption[];
};

/**
 * The block covers the whole field, never individual options: every option the
 * select offers changes the schedule and with it the price key, so there is no
 * financially inert reassignment to exempt.
 */
const frozenPriceBlocker: ChoreographyScheduleCapacityBlocker = {
  code: "frozen-price",
  label:
    "No se puede reasignar el cupo de cronograma: hay inscripciones con dinero asignado y su precio quedó congelado contra este cronograma.",
};

/**
 * The blocking reasons the server assembles for the page's alert. They are not
 * filtered by role: the auditor also has to see why the schedule cannot be
 * moved.
 *
 * The caller reads the money once and derives both this list and the modality
 * one from it: the two alerts describe the same inscriptions.
 */
export function toScheduleCapacityBlockers(
  hasFrozenPrice: boolean,
): ChoreographyScheduleCapacityBlocker[] {
  return hasFrozenPrice ? [frozenPriceBlocker] : [];
}

type ResolvedScheduleCapacityOption = ChoreographyScheduleCapacityOption & {
  scheduleCapacityId: string | null;
  scheduleId: string;
};

type ScheduleCapacityOptionCandidate = Omit<
  ResolvedScheduleCapacityOption,
  "isFull"
>;

/**
 * The options the view offers are exactly the ones the intent accepts: the
 * capacities compatible with the choreography's event, modality and group type,
 * minus the alternatives that would reprice a money-holding inscription, plus
 * the capacity assigned today. That addition is for visibility only: if the
 * assignment fell outside compatibility (the schedule's modality changed, the
 * capacity was deleted), it has to stay in view rather than disappear from the
 * select without explanation.
 *
 * Price-divergent alternatives are **omitted**, not marked: `disabled` keeps its
 * single meaning, `sin cupo`, and a greyed option whose own label reads
 * `1/75 ocupados` would be a disabled option claiming to have room. It is the
 * same treatment the modality-incompatible schedules already get, which are
 * absent rather than offered.
 *
 * The assignment is never filtered, whether it comes from the compatible set or
 * is pushed back in: the move that keeps the choreography where it is cannot
 * reprice anything, and dropping it would empty the select.
 *
 * Without occupancy: the intent only needs to know which ids it accepts, and
 * counting occupants to label options nobody will read is wasted work. The view
 * goes through `resolveChoreographyScheduleCapacityOptions`.
 */
async function resolveScheduleCapacityCandidates(input: {
  choreography: ChoreographyDetail;
  eventId: string;
}): Promise<{
  hasSelectableAlternative: boolean;
  options: ScheduleCapacityOptionCandidate[];
  priceDivergentOptionIds: string[];
}> {
  const [resolution, diverges] = await Promise.all([
    resolveEventBasesScheduleOptions({
      eventId: input.eventId,
      groupType: input.choreography.groupType,
      modalityId: input.choreography.modalityId,
    }),
    loadPriceDivergenceCheck({ choreographyId: input.choreography.id }),
  ]);
  const compatibleOptions: ScheduleCapacityOptionCandidate[] =
    resolution.options.map((option) => ({
      id: option.id,
      label: formatScheduleDateTime(option.schedule),
      scheduleCapacityId: option.scheduleCapacityId,
      scheduleId: option.scheduleId,
    }));
  const priceDivergentOptionIds = compatibleOptions
    .filter(
      (option) =>
        option.id !== input.choreography.scheduleCapacityId &&
        diverges({
          // The reassignment moves the schedule alone: the group type the
          // destination is priced against is the one the roster already gives
          // the choreography.
          groupType: input.choreography.groupType,
          scheduleId: option.scheduleId,
        }),
    )
    .map((option) => option.id);
  const options = compatibleOptions.filter(
    (option) => !priceDivergentOptionIds.includes(option.id),
  );

  if (
    !options.some(
      (option) => option.id === input.choreography.scheduleCapacityId,
    )
  ) {
    options.push(toAssignedScheduleCapacityOption(input.choreography));
  }

  return {
    // Whether the field is reassignable is read off the list that survived the
    // filter, not off the compatible count: those two answer the same question
    // by different routes and disagree exactly when the only alternative was
    // the one omitted, which would render an open select with nothing in it but
    // the assignment.
    hasSelectableAlternative: options.some(
      (option) => option.id !== input.choreography.scheduleCapacityId,
    ),
    options,
    priceDivergentOptionIds,
  };
}

/**
 * The same options the intent accepts, labelled with occupancy and with the full
 * ones marked, for the detail's select.
 */
export async function resolveChoreographyScheduleCapacityOptions(input: {
  choreography: ChoreographyDetail;
  eventId: string;
}): Promise<{
  hasSelectableAlternative: boolean;
  options: ResolvedScheduleCapacityOption[];
}> {
  const candidates = await resolveScheduleCapacityCandidates(input);

  return {
    hasSelectableAlternative: candidates.hasSelectableAlternative,
    options: await withScheduleCapacityOccupancy({
      // The same exclusion as the lock: the choreography being moved does not
      // count against the capacity it already occupies.
      excludeChoreographyId: input.choreography.id,
      options: candidates.options,
    }),
  };
}

export async function updateChoreographyScheduleCapacity(input: {
  choreography: ChoreographyDetail;
  eventId: string;
  formData: FormData;
}): Promise<ChoreographyFieldUpdateErrorData | ChoreographySuccessData> {
  // The same hard block as the roster and deletion: with a presentation the
  // schedule is not touched, even if the form sends a capacity.
  if (input.choreography.hasPresentation) {
    return {
      message:
        "No se puede cambiar el cupo de cronograma: la coreografía ya tiene presentación.",
      status: "error",
    };
  }

  const { hasSelectableAlternative, options, priceDivergentOptionIds } =
    await resolveScheduleCapacityCandidates({
      choreography: input.choreography,
      eventId: input.eventId,
    });

  // The same condition that closes the field in the loader, read off the same
  // list. Without it the intent accepts a move the view refuses to offer: with
  // no alternative left the select is read-only, but a hand-crafted POST naming
  // the assignment would move the price key all the same.
  if (!hasSelectableAlternative) {
    return {
      message:
        priceDivergentOptionIds.length > 0
          ? frozenPriceScheduleCapacityMessage
          : "No se puede cambiar el cupo de cronograma: no hay otro cronograma compatible con esta coreografía.",
      status: "error",
    };
  }

  const requestedOptionId = readRequestedScheduleCapacityOptionId(
    input.formData,
  );
  const selectedOption = options.find(
    (option) => option.id === requestedOptionId,
  );

  // Compatibility is revalidated here; what the form sent is not trusted. A
  // price-divergent capacity is now simply absent from the accepted set, so the
  // reason has to be re-derived: an id the select offered before an allocation
  // landed is a price problem, not an incompatible selection, and reporting it
  // as one would send the administrator looking at the modality.
  if (!selectedOption) {
    return {
      message:
        requestedOptionId !== null &&
        priceDivergentOptionIds.includes(requestedOptionId)
          ? frozenPriceScheduleCapacityMessage
          : invalidScheduleEntryMessage,
      status: "error",
    };
  }

  const result = await db.transaction(async (tx) => {
    // The guard is re-checked on the intent and not only in the loader (the
    // field may have been left open in a stale tab, or the submit may be
    // hand-crafted), and re-checked *inside* the transaction together with
    // the lock: reading it outside, or before opening one, left a window in
    // which an allocation landing in between went unnoticed and the schedule
    // moved anyway. Same guard-then-lock pair as the roster path, so the two
    // entry points can't drift on order or on which move counts as frozen.
    const move = await guardAndLockScheduleCapacityMove({
      choreographyId: input.choreography.id,
      // The reassignment moves the schedule alone: the group type it is priced
      // against is the one the roster already gives it.
      destinationGroupType: input.choreography.groupType,
      scheduleCapacityId: selectedOption.scheduleCapacityId,
      scheduleId: selectedOption.scheduleId,
      tx,
    });

    if (!move.ok) {
      return move;
    }

    await tx
      .update(choreographies)
      .set({
        scheduleCapacityId: move.scheduleCapacityId,
        scheduleId: move.scheduleId,
        updatedAt: new Date(),
      })
      .where(eq(choreographies.id, input.choreography.id));

    return move;
  });

  if (!result.ok) {
    return {
      message: result.error,
      status: "error",
    };
  }

  return choreographySavedSuccess();
}

function toAssignedScheduleCapacityOption(
  choreography: ChoreographyDetail,
): ScheduleCapacityOptionCandidate {
  const isGlobalOption =
    choreography.scheduleCapacityId ===
    getGlobalScheduleCapacityOptionId(choreography.scheduleId);

  return {
    id: choreography.scheduleCapacityId,
    label: choreography.scheduleLabel,
    scheduleCapacityId: isGlobalOption ? null : choreography.scheduleCapacityId,
    scheduleId: choreography.scheduleId,
  };
}

function readRequestedScheduleCapacityOptionId(formData: FormData) {
  const value = formData.get(assignedScheduleCapacityFieldName);

  return typeof value === "string" && value.length > 0 ? value : null;
}

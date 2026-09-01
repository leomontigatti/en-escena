import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import { getGlobalScheduleCapacityOptionId } from "@/lib/choreographies/choreography-roster.shared";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";
import {
  guardAndLockScheduleCapacityMove,
  invalidScheduleEntryMessage,
} from "@/lib/choreographies/schedule-capacity-lock.server";
import type { ScheduleCapacitySelectOption } from "@/lib/choreographies/schedule-capacity-options";
import { withScheduleCapacityOccupancy } from "@/lib/choreographies/schedule-capacity-options.server";
import { resolveEventBasesScheduleOptions } from "@/lib/events/bases.server";

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
 * plus the capacity assigned today. That addition is for visibility only: if the
 * assignment fell outside compatibility (the schedule's modality changed, the
 * capacity was deleted), it has to stay in view rather than disappear from the
 * select without explanation.
 *
 * Without occupancy: the intent only needs to know which ids it accepts, and
 * counting occupants to label options nobody will read is wasted work. The view
 * goes through `resolveChoreographyScheduleCapacityOptions`.
 */
async function resolveScheduleCapacityCandidates(input: {
  choreography: ChoreographyDetail;
  eventId: string;
}): Promise<{
  hasMultipleCompatibleOptions: boolean;
  options: ScheduleCapacityOptionCandidate[];
}> {
  const resolution = await resolveEventBasesScheduleOptions({
    eventId: input.eventId,
    groupType: input.choreography.groupType,
    modalityId: input.choreography.modalityId,
  });
  const options: ScheduleCapacityOptionCandidate[] = resolution.options.map(
    (option) => ({
      id: option.id,
      label: formatScheduleDateTime(option.schedule),
      scheduleCapacityId: option.scheduleCapacityId,
      scheduleId: option.scheduleId,
    }),
  );

  if (
    !options.some(
      (option) => option.id === input.choreography.scheduleCapacityId,
    )
  ) {
    options.push(toAssignedScheduleCapacityOption(input.choreography));
  }

  return {
    hasMultipleCompatibleOptions: resolution.status === "multiple",
    options,
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
  hasMultipleCompatibleOptions: boolean;
  options: ResolvedScheduleCapacityOption[];
}> {
  const candidates = await resolveScheduleCapacityCandidates(input);

  return {
    hasMultipleCompatibleOptions: candidates.hasMultipleCompatibleOptions,
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

  const { hasMultipleCompatibleOptions, options } =
    await resolveScheduleCapacityCandidates({
      choreography: input.choreography,
      eventId: input.eventId,
    });

  // The same condition that closes the field in the loader. Without it the intent
  // accepts a move the view refuses to offer: with a single compatible capacity
  // the select is read-only, but a hand-crafted POST naming that capacity would
  // move the price key all the same.
  if (!hasMultipleCompatibleOptions) {
    return {
      message:
        "No se puede cambiar el cupo de cronograma: no hay otro cronograma compatible con esta coreografía.",
      status: "error",
    };
  }

  const requestedOptionId = readRequestedScheduleCapacityOptionId(
    input.formData,
  );
  const selectedOption = options.find(
    (option) => option.id === requestedOptionId,
  );

  // Compatibility is revalidated here; what the form sent is not trusted.
  if (!selectedOption) {
    return {
      message: invalidScheduleEntryMessage,
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

import { useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { useNavigation, useSubmit } from "react-router";

import { isRouteFormPending } from "@/lib/shared/forms";

import {
  assignedScheduleCapacityFieldName,
  updateChoreographyScheduleCapacityIntent,
} from "./shared";
import type { ChoreographyDetailLoaderData } from "./server";

type ScheduleCapacityFormValues = Record<
  typeof assignedScheduleCapacityFieldName,
  string
>;

/**
 * The standalone schedule capacity reassignment, shaped like the modality
 * correction next to it: the select holds the choice and the page's `Guardar`
 * writes it. Moving the dropdown used to be the write, which made the detail
 * page carry two interaction models at once —one field saving on change beside
 * one field saving on a button— for the same kind of correction.
 *
 * It is a form of its own, not a field of the roster's: it posts a single
 * intent that re-checks occupancy on its own, and it must not be dragged into
 * the roster's confirmation dialog, which enumerates consequences the capacity
 * move does not have.
 *
 * Sharing the footer means sharing the modality's mutual exclusion too: a
 * single `Guardar` can only mean one form at a time, so while the roster has
 * unsaved changes the capacity stops offering its select —the same read-only
 * collapse the modality field does— and the roster inputs go the other way
 * while a capacity is pending. Without that, `Guardar` would write the capacity
 * and drop the roster edits with no signal that it had.
 */
export function useScheduleCapacityForm({
  isRosterFormDirty,
  loaderData,
}: {
  isRosterFormDirty: boolean;
  loaderData: ChoreographyDetailLoaderData;
}) {
  const savedScheduleCapacityId = loaderData.choreography.scheduleCapacityId;
  const defaultValues = useMemo<ScheduleCapacityFormValues>(
    () => ({
      [assignedScheduleCapacityFieldName]: savedScheduleCapacityId,
    }),
    [savedScheduleCapacityId],
  );
  // Deliberately without a Zod resolver, against the style guide's default for
  // forms: the only rule here —a destination, and one other than the saved
  // one— is the `save` guard below, and reaching it through
  // `form.handleSubmit` costs the guarantee the whole field exists for. RHF
  // settles its own submit state after the handler resolves, which lands on
  // top of the resynchronization reset and leaves the select showing the
  // capacity the server refused.
  const form = useForm<ScheduleCapacityFormValues>({ defaultValues });
  const { reset, watch } = form;
  const navigation = useNavigation();
  const submit = useSubmit();

  const selectedScheduleCapacityId = watch(assignedScheduleCapacityFieldName);
  const isDirty = selectedScheduleCapacityId !== savedScheduleCapacityId;
  const canReassign =
    loaderData.scheduleCapacity.canReassign && !isRosterFormDirty;
  const isSubmitting = isRouteFormPending(navigation, {
    intent: updateChoreographyScheduleCapacityIntent,
  });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  useResetOnSettledSubmission({ defaultValues, isSubmitting, reset });

  const save = () => {
    if (!isDirty || selectedScheduleCapacityId.length === 0) {
      return;
    }

    submit(toScheduleCapacityFormData(selectedScheduleCapacityId), {
      method: "post",
    });
  };

  return {
    canReassign,
    canSave: canReassign && isDirty && !isSubmitting,
    form,
    isDirty,
    isSubmitting,
    save,
  };
}

/**
 * `schedule-capacity-full` is an ordinary race that no filtering of the options
 * prevents, so the save can still be refused. A rejection writes nothing and the
 * loader comes back with the old capacity, so the select cannot be left showing
 * the destination the server turned away: on this page that would mean lying
 * about a price key.
 *
 * Restoring on the return to `idle` covers both exits — after an acceptance the
 * loader already carries the new capacity and the reset goes unnoticed. It hangs
 * off this form's own submission, not off every navigation the way
 * `useSavedValueSelectForm` does: with a `Guardar` in between, a selection that
 * has not been submitted yet has to survive.
 */
function useResetOnSettledSubmission({
  defaultValues,
  isSubmitting,
  reset,
}: {
  defaultValues: ScheduleCapacityFormValues;
  isSubmitting: boolean;
  reset: (values: ScheduleCapacityFormValues) => void;
}) {
  const wasSubmittingRef = useRef(false);

  useEffect(() => {
    if (isSubmitting) {
      wasSubmittingRef.current = true;
      return;
    }

    if (!wasSubmittingRef.current) {
      return;
    }

    wasSubmittingRef.current = false;
    reset(defaultValues);
  }, [defaultValues, isSubmitting, reset]);
}

function toScheduleCapacityFormData(scheduleCapacityId: string) {
  const formData = new FormData();
  formData.set("intent", updateChoreographyScheduleCapacityIntent);
  formData.set(assignedScheduleCapacityFieldName, scheduleCapacityId);

  return formData;
}

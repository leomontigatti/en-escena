import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";

import { getFooterState, getPendingSave } from "./footer-save-state";
import { canSubmitModalityCorrection } from "./modality-form-state";
import {
  choreographyFormSchema,
  type ChoreographyFormValues,
} from "./roster-fields";
import {
  canSubmitChoreographyEdit,
  getExperienceLevelSlotState,
  getRosterScheduleSelectOptions,
  hasNoCompatibleCategory,
} from "./roster-form-state";
import {
  renameChoreographyIntent,
  updateChoreographyRosterIntent,
  type ChoreographyViewActionData,
} from "./shared";
import { useModalityForm } from "./use-modality-form";
import { useRosterForm } from "./use-roster-form";
import { useScheduleCapacityForm } from "./use-schedule-capacity-form";
import type { ChoreographyDetailLoaderData } from "./server";

/**
 * The detail page's three forms —roster, modality correction and schedule
 * capacity reassignment— and the coordination between them: which one owns the
 * single footer `Guardar`, which fields the others collapse to read-only while
 * it does, and what the button submits. The view keeps the markup; the
 * exclusion matrix lives here, behind one named seam.
 */
export function useChoreographyDetailForms({
  actionData,
  loaderData,
}: {
  actionData?: ChoreographyViewActionData;
  loaderData: ChoreographyDetailLoaderData;
}) {
  const choreography = loaderData.choreography;
  const defaultValues = useMemo(
    () => getChoreographyFormValues(loaderData, actionData),
    [actionData, loaderData],
  );
  const form = useForm<ChoreographyFormValues>({
    defaultValues,
    mode: "onSubmit",
    resolver: zodResolver(choreographyFormSchema),
  });
  const { reset } = form;

  const roster = useRosterForm({ form, loaderData });
  // The two forms exclude each other on screen: while one has unsaved changes
  // the other goes read-only, because the same resolution would rewrite the
  // same derived fields from two sides.
  const isRosterFormDirty =
    roster.hasNameChanged ||
    roster.hasRosterChanged ||
    roster.hasProfessorsChanged;
  const modality = useModalityForm({ isRosterFormDirty, loaderData });
  const scheduleCapacity = useScheduleCapacityForm({
    isRosterFormDirty,
    loaderData,
  });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const experienceLevelSlot = getExperienceLevelSlotState({
    choreography,
    derivedResolution: roster.derivedResolution,
    hasResolvedRosterChange: roster.hasResolvedRosterChange,
  });
  const rosterScheduleOptions = getRosterScheduleSelectOptions({
    hasResolvedRosterChange: roster.hasResolvedRosterChange,
    scheduleResolution: roster.scheduleResolution,
  });
  const noCompatibleCategory = hasNoCompatibleCategory({
    derivedResolution: roster.derivedResolution,
    hasResolvedRosterChange: roster.hasResolvedRosterChange,
  });

  // One `Guardar` in the footer for the three forms. They exclude each other on
  // screen, so the pending correction decides what the button submits: the
  // modality and the schedule capacity write on their own, the roster one still
  // confirms first.
  //
  // The capacity only counts while its own select is the one on screen: a
  // resolved roster change replaces it with the roster's, and a selection left
  // behind in the hidden form must not decide what `Guardar` means.
  const hasPendingScheduleCapacity =
    scheduleCapacity.isDirty && rosterScheduleOptions === null;
  const pendingSave = getPendingSave({
    hasPendingScheduleCapacity,
    isModalityDirty: modality.isDirty,
  });
  const canSubmitModality = canSubmitModalityCorrection(modality);
  const canSubmitRoster =
    loaderData.canEdit &&
    !modality.isDirty &&
    !hasPendingScheduleCapacity &&
    canSubmitChoreographyEdit({
      canEditRoster: roster.canEditRoster,
      derivedResolution: roster.derivedResolution,
      hasNameChanged: roster.hasNameChanged,
      hasProfessorsChanged: roster.hasProfessorsChanged,
      hasRosterChanged: roster.hasRosterChanged,
      isResolving: roster.isResolving,
      isSubmitting: roster.isSubmitting,
      resolution: roster.resolution,
      resolvedSelectionKey: roster.resolvedSelectionKey,
      scheduleResolution: roster.scheduleResolution,
      selectionKey: roster.selectionKey,
      showRosterExperienceLevelSelect: experienceLevelSlot.showRosterSelect,
      watchedDancerIds: roster.watchedDancerIds,
      watchedExperienceLevelId: roster.watchedExperienceLevelId,
      watchedScheduleCapacityId: roster.watchedScheduleCapacityId,
    });

  const footer = getFooterState({
    canSubmitModality,
    canSubmitRoster,
    modality,
    pendingSave,
    roster,
    scheduleCapacity,
  });
  // The roster inputs go read-only while another form owns the button, so the
  // exclusion the modality already had now covers the capacity too: `Guardar`
  // writing the capacity can no longer drop roster edits made beside it.
  const isRosterEditDisabled = modality.isDirty || hasPendingScheduleCapacity;

  // An isolated rename does not touch the roster, so it avoids the hard lock from
  // a presentation that does apply to `update-roster`.
  const intent =
    roster.hasRosterChanged || roster.hasProfessorsChanged
      ? updateChoreographyRosterIntent
      : renameChoreographyIntent;

  return {
    canSubmitRoster,
    experienceLevelSlot,
    footer,
    form,
    hasPendingScheduleCapacity,
    intent,
    isRosterEditDisabled,
    modality,
    noCompatibleCategory,
    pendingSave,
    roster,
    rosterScheduleOptions,
    scheduleCapacity,
  };
}

function getChoreographyFormValues(
  loaderData: ChoreographyDetailLoaderData,
  actionData?: ChoreographyViewActionData,
): ChoreographyFormValues {
  const choreography = loaderData.choreography;

  return {
    dancerIds: choreography.dancers.map((dancer) => dancer.id),
    experienceLevelId: choreography.experienceLevelId ?? "",
    musicStorageKey: choreography.musicStorageKey ?? "",
    name:
      (actionData && "values" in actionData
        ? actionData.values.name
        : undefined) ?? choreography.name,
    professorIds: choreography.professors.map((professor) => professor.id),
    scheduleCapacityId: "",
  };
}

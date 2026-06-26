import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SubmitEventHandler } from "react";
import { useForm } from "react-hook-form";
import { useFetcher, useNavigation } from "react-router";
import { toast } from "sonner";

import {
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import {
  buildResolveChoreographyDancersFormData,
  formatPersonName,
  formatScheduleOptionDateTime,
  getPersistedDancerResolutionState,
  getSelectableScheduleOptions,
  getSelectionKey,
  mapResolvedDancerResolutionState,
} from "@/features/portal/choreographies/detail/roster-editor-fields";
import {
  choreographyEditSchema,
  choreographyResolutionErrorToastId,
  resolveChoreographyDancersIntent,
  type ChoreographyEditFieldErrors,
  type ChoreographyEditValues,
  type ChoreographyRosterEditorActionData,
  type ChoreographyRosterEditorLoaderData,
  type ChoreographyRosterEditorResolutionActionData,
  type DancerResolutionState,
  updateChoreographyIntent,
} from "@/features/portal/choreographies/detail/roster-editor.shared";
import type { ResolveChoreographyDancersResult } from "@/lib/portal/choreography-roster.server";

const emptyChoreographyEditFieldErrors: ChoreographyEditFieldErrors = {};
type ChoreographySummary = ChoreographyRosterEditorLoaderData["choreography"];
type ScheduleResolution =
  | Extract<
      ResolveChoreographyDancersResult,
      { ok: true }
    >["resolution"]["schedule"]
  | null;

export function useChoreographyRosterEditorForm({
  actionData,
  loaderData,
}: {
  actionData: ChoreographyRosterEditorActionData;
  loaderData: ChoreographyRosterEditorLoaderData;
}) {
  const experienceLevelFieldId = useId();
  const scheduleFieldId = useId();
  const resolutionFetcher =
    useFetcher<ChoreographyRosterEditorResolutionActionData>();
  const navigation = useNavigation();
  const choreography = loaderData.choreography;
  const initialDancerIds = useMemo(
    () => choreography.dancers.map((dancer) => dancer.id),
    [choreography.dancers],
  );
  const initialProfessorIds = useMemo(
    () => choreography.professors.map((professor) => professor.id),
    [choreography.professors],
  );
  const selectedDancerIds = actionData?.selectedDancerIds ?? initialDancerIds;
  const selectedProfessorIds =
    actionData?.selectedProfessorIds ?? initialProfessorIds;
  const form = useForm<ChoreographyEditValues>({
    resolver: zodResolver(choreographyEditSchema),
    defaultValues: buildChoreographyEditDefaultValues({
      actionData,
      choreography,
      selectedDancerIds,
      selectedProfessorIds,
    }),
  });
  const persistedSelectionKey = useMemo(
    () => getSelectionKey(initialDancerIds),
    [initialDancerIds],
  );
  const persistedProfessorSelectionKey = useMemo(
    () => getSelectionKey(initialProfessorIds),
    [initialProfessorIds],
  );
  const persistedResolution = useMemo(
    () => getPersistedDancerResolutionState(choreography),
    [choreography],
  );
  const [derivedResolution, setDerivedResolution] =
    useState<DancerResolutionState>(persistedResolution);
  const [resolution, setResolution] =
    useState<ResolveChoreographyDancersResult | null>(null);
  const [resolvedSelectionKey, setResolvedSelectionKey] = useState(
    persistedSelectionKey,
  );
  const submittedSelectionKeyRef = useRef<string | null>(null);
  const watchedDancerIds = form.watch("dancerIds");
  const watchedProfessorIds = form.watch("professorIds");
  const watchedExperienceLevelId = form.watch("experienceLevelId") ?? "";
  const watchedScheduleCapacityId = form.watch("scheduleCapacityId") ?? "";
  const dancerSelectionKey = useMemo(
    () => getSelectionKey(watchedDancerIds),
    [watchedDancerIds],
  );
  const professorSelectionKey = useMemo(
    () => getSelectionKey(watchedProfessorIds),
    [watchedProfessorIds],
  );
  const hasRosterChanged = dancerSelectionKey !== persistedSelectionKey;
  const hasProfessorsChanged =
    professorSelectionKey !== persistedProfessorSelectionKey;
  const canEditDancers = loaderData.dancerEditingEligibility.canEdit;
  const canEditProfessors =
    !loaderData.eventContext.isReadOnly && !choreography.hasPresentation;
  const isResolving = resolutionFetcher.state !== "idle";
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === updateChoreographyIntent;
  const hasResolvedRosterChange =
    hasRosterChanged &&
    dancerSelectionKey === resolvedSelectionKey &&
    resolution?.ok === true;
  const resolutionData = resolutionFetcher.data;
  const scheduleResolution = resolution?.ok
    ? resolution.resolution.schedule
    : null;
  const scheduleOptions = getSelectableScheduleOptions(scheduleResolution);
  const experienceLevelOptions = derivedResolution.experienceLevelOptions.map(
    (option) => ({
      value: option.id,
      label: option.name,
    }),
  );
  const scheduleSelectOptions = scheduleOptions.map((option) => ({
    value: option.id,
    label: formatScheduleOptionDateTime(option),
  }));
  const readonlyExperienceLevelName = hasResolvedRosterChange
    ? ""
    : (choreography.experienceLevelName ?? "");
  let readonlyScheduleLabel = choreography.scheduleLabel;

  if (hasResolvedRosterChange && scheduleResolution?.status === "auto") {
    readonlyScheduleLabel = formatScheduleOptionDateTime(
      scheduleResolution.options[0],
    );
  }

  const fieldErrors =
    actionData?.status === "update-error" && actionData.section === "dancers"
      ? (actionData.fieldErrors ?? emptyChoreographyEditFieldErrors)
      : emptyChoreographyEditFieldErrors;
  const dancerOptions = useMemo(
    () =>
      loaderData.availableDancers.map((dancer) => ({
        value: dancer.id,
        label: formatPersonName(dancer),
      })),
    [loaderData.availableDancers],
  );
  const professorOptions = useMemo(
    () =>
      loaderData.availableProfessors.map((professor) => ({
        value: professor.id,
        label: formatPersonName(professor),
      })),
    [loaderData.availableProfessors],
  );
  const canSubmit = canSubmitChoreographyEdit({
    canEditDancers,
    canEditProfessors,
    dancerSelectionKey,
    derivedResolution,
    hasProfessorsChanged,
    hasRosterChanged,
    isResolving,
    isSubmitting,
    resolution,
    resolvedSelectionKey,
    scheduleResolution,
    watchedDancerIds,
    watchedExperienceLevelId,
    watchedScheduleCapacityId,
  });

  useEffect(() => {
    form.reset(
      buildChoreographyEditDefaultValues({
        actionData,
        choreography,
        selectedDancerIds,
        selectedProfessorIds,
      }),
    );
    setDerivedResolution(persistedResolution);
    setResolution(null);
    setResolvedSelectionKey(persistedSelectionKey);
    submittedSelectionKeyRef.current = null;
  }, [
    actionData?.selectedExperienceLevelId,
    actionData?.selectedScheduleCapacityId,
    choreography.experienceLevelId,
    choreography.scheduleCapacityId,
    form,
    persistedResolution,
    persistedSelectionKey,
    selectedDancerIds,
    selectedProfessorIds,
  ]);

  useApplyServerFieldErrors(form, fieldErrors);

  useEffect(() => {
    if (!hasRosterChanged) {
      setDerivedResolution(persistedResolution);
      setResolution(null);
      setResolvedSelectionKey(persistedSelectionKey);
      form.setValue(
        "scheduleCapacityId",
        choreography.scheduleCapacityId ?? "",
        {
          shouldDirty: false,
        },
      );
      submittedSelectionKeyRef.current = null;
      return;
    }

    if (
      !canEditDancers ||
      watchedDancerIds.length === 0 ||
      dancerSelectionKey === resolvedSelectionKey ||
      dancerSelectionKey === submittedSelectionKeyRef.current
    ) {
      return;
    }

    resolutionFetcher.submit(
      buildResolveChoreographyDancersFormData(watchedDancerIds),
      { method: "post" },
    );
    submittedSelectionKeyRef.current = dancerSelectionKey;
  }, [
    canEditDancers,
    choreography.scheduleCapacityId,
    dancerSelectionKey,
    form,
    hasRosterChanged,
    persistedResolution,
    persistedSelectionKey,
    resolutionFetcher,
    resolvedSelectionKey,
    watchedDancerIds,
  ]);

  useEffect(() => {
    if (
      resolutionFetcher.state !== "idle" ||
      resolutionData?.intent !== resolveChoreographyDancersIntent
    ) {
      return;
    }

    const submittedSelectionKey =
      submittedSelectionKeyRef.current ?? dancerSelectionKey;
    submittedSelectionKeyRef.current = null;
    setResolvedSelectionKey(submittedSelectionKey);
    setResolution(resolutionData.result);

    if (!resolutionData.result.ok) {
      toast.error(resolutionData.result.message, {
        id: choreographyResolutionErrorToastId,
      });
      form.setError("dancerIds", {
        message: resolutionData.result.message,
        type: "manual",
      });
      form.setValue("scheduleCapacityId", "", { shouldDirty: true });
      return;
    }

    form.clearErrors("dancerIds");
    const nextResolution = mapResolvedDancerResolutionState(
      resolutionData.result,
    );
    const categoryChanged =
      derivedResolution.categoryId !== nextResolution.categoryId;

    if (!nextResolution.experienceLevelRequired || categoryChanged) {
      form.setValue("experienceLevelId", "", { shouldDirty: true });
    }

    const nextSchedule = resolutionData.result.resolution.schedule;

    if (
      nextSchedule.status === "keep-current" ||
      nextSchedule.status === "auto"
    ) {
      form.setValue(
        "scheduleCapacityId",
        nextSchedule.selectedScheduleCapacityId,
        {
          shouldDirty: true,
        },
      );
      form.clearErrors("scheduleCapacityId");
    } else if (nextSchedule.status === "multiple") {
      if (
        !nextSchedule.options.some(
          (option) => option.id === watchedScheduleCapacityId,
        )
      ) {
        form.setValue("scheduleCapacityId", "", { shouldDirty: true });
      }
    } else {
      form.setValue("scheduleCapacityId", "", { shouldDirty: true });
      toast.error(nextSchedule.error, {
        id: choreographyResolutionErrorToastId,
      });
      form.setError("dancerIds", {
        message: nextSchedule.error,
        type: "manual",
      });
    }

    setDerivedResolution(nextResolution);
  }, [
    dancerSelectionKey,
    derivedResolution.categoryId,
    form,
    resolutionData,
    resolutionFetcher.state,
    watchedScheduleCapacityId,
  ]);

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    if (!canSubmit) {
      event.preventDefault();
      return;
    }

    const parsed = choreographyEditSchema.safeParse(form.getValues());

    if (!parsed.success) {
      event.preventDefault();
      void form.trigger();
      return;
    }

    if (
      hasRosterChanged &&
      derivedResolution.experienceLevelRequired &&
      watchedExperienceLevelId.length === 0
    ) {
      event.preventDefault();
      form.setError("experienceLevelId", {
        message: requiredFieldMessage,
        type: "manual",
      });
      document.getElementById(experienceLevelFieldId)?.focus();
      return;
    }

    if (
      hasRosterChanged &&
      scheduleResolution?.status === "multiple" &&
      watchedScheduleCapacityId.length === 0
    ) {
      event.preventDefault();
      form.setError("scheduleCapacityId", {
        message: requiredFieldMessage,
        type: "manual",
      });
      document.getElementById(scheduleFieldId)?.focus();
    }
  };

  return {
    canEditDancers,
    canEditProfessors,
    canSubmit,
    dancerOptions,
    derivedResolution,
    experienceLevelFieldId,
    experienceLevelOptions,
    form,
    handleSubmit,
    hasResolvedRosterChange,
    isResolving,
    isSubmitting,
    professorOptions,
    readonlyExperienceLevelName,
    readonlyScheduleLabel,
    scheduleFieldId,
    scheduleResolution,
    scheduleSelectOptions,
  };
}

function buildChoreographyEditDefaultValues({
  actionData,
  choreography,
  selectedDancerIds,
  selectedProfessorIds,
}: {
  actionData: ChoreographyRosterEditorActionData;
  choreography: ChoreographySummary;
  selectedDancerIds: string[];
  selectedProfessorIds: string[];
}): ChoreographyEditValues {
  return {
    dancerIds: selectedDancerIds,
    professorIds: selectedProfessorIds,
    experienceLevelId:
      actionData?.selectedExperienceLevelId ??
      choreography.experienceLevelId ??
      "",
    scheduleCapacityId:
      actionData?.selectedScheduleCapacityId ??
      choreography.scheduleCapacityId ??
      "",
  };
}

function canSubmitChoreographyEdit({
  canEditDancers,
  canEditProfessors,
  dancerSelectionKey,
  derivedResolution,
  hasProfessorsChanged,
  hasRosterChanged,
  isResolving,
  isSubmitting,
  resolution,
  resolvedSelectionKey,
  scheduleResolution,
  watchedDancerIds,
  watchedExperienceLevelId,
  watchedScheduleCapacityId,
}: {
  canEditDancers: boolean;
  canEditProfessors: boolean;
  dancerSelectionKey: string;
  derivedResolution: DancerResolutionState;
  hasProfessorsChanged: boolean;
  hasRosterChanged: boolean;
  isResolving: boolean;
  isSubmitting: boolean;
  resolution: ResolveChoreographyDancersResult | null;
  resolvedSelectionKey: string;
  scheduleResolution: ScheduleResolution;
  watchedDancerIds: string[];
  watchedExperienceLevelId: string;
  watchedScheduleCapacityId: string;
}) {
  if (!hasRosterChanged && !hasProfessorsChanged) {
    return false;
  }

  if (isResolving || isSubmitting) {
    return false;
  }

  if (hasProfessorsChanged && !canEditProfessors) {
    return false;
  }

  if (!hasRosterChanged) {
    return true;
  }

  if (
    !canEditDancers ||
    watchedDancerIds.length === 0 ||
    dancerSelectionKey !== resolvedSelectionKey ||
    resolution?.ok !== true ||
    scheduleResolution?.status === "none"
  ) {
    return false;
  }

  if (
    scheduleResolution?.status === "multiple" &&
    watchedScheduleCapacityId.length === 0
  ) {
    return false;
  }

  return (
    !derivedResolution.experienceLevelRequired ||
    watchedExperienceLevelId.length > 0
  );
}

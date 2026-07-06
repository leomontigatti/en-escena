import { zodResolver } from "@hookform/resolvers/zod";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { SubmitEventHandler } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { useFetcher, useNavigation } from "react-router";
import { toast } from "sonner";

import { requiredFieldMessage } from "@/lib/shared/forms";
import {
  formatPersonName,
  formatScheduleOptionDateTime,
  getSelectableScheduleOptions,
  getSelectionKey,
} from "@/features/portal/choreographies/detail/roster-editor-options";
import {
  buildChoreographyEditDefaultValues,
  canSubmitChoreographyEdit,
  getChoreographyEditPermissions,
  getPersistedDancerResolutionState,
  getReadonlyChoreographyLabels,
  getResolvedRosterFieldState,
  getScheduleResolution,
  hasResolvedRosterSelectionChange,
  type ScheduleResolution,
  shouldResolveRosterSelection,
} from "@/features/portal/choreographies/detail/roster-editor-form-state";
import {
  choreographyEditSchema,
  choreographyResolutionErrorToastId,
  resolveChoreographyDancersIntent,
  type ChoreographyEditValues,
  type ChoreographyRosterEditorActionData,
  type ChoreographyRosterEditorLoaderData,
  type ChoreographyRosterEditorResolutionActionData,
  type DancerResolutionState,
  updateChoreographyIntent,
} from "@/features/portal/choreographies/detail/roster-editor.shared";
import type { ResolveChoreographyDancersResult } from "@/lib/portal/choreography-roster.server";

type ChoreographySummary = ChoreographyRosterEditorLoaderData["choreography"];
type ChoreographyEditForm = UseFormReturn<ChoreographyEditValues>;
type RosterResolutionFetcher = ReturnType<
  typeof useFetcher<ChoreographyRosterEditorResolutionActionData>
>;
type ChoreographyEditNavigation = ReturnType<typeof useNavigation>;

function buildResolveChoreographyDancersFormData(dancerIds: string[]) {
  const formData = new FormData();
  formData.set("intent", resolveChoreographyDancersIntent);

  for (const dancerId of dancerIds) {
    formData.append("dancerIds", dancerId);
  }

  return formData;
}

export function useChoreographyRosterEditorForm({
  actionData,
  hasMusicChanged,
  musicHasValidationError,
  loaderData,
}: {
  actionData: ChoreographyRosterEditorActionData;
  hasMusicChanged: boolean;
  musicHasValidationError: boolean;
  loaderData: ChoreographyRosterEditorLoaderData;
}) {
  const experienceLevelFieldId = useId();
  const scheduleFieldId = useId();
  const resolutionFetcher =
    useFetcher<ChoreographyRosterEditorResolutionActionData>();
  const navigation = useNavigation();
  const choreography = loaderData.choreography;
  const {
    persistedProfessorSelectionKey,
    persistedResolution,
    persistedSelectionKey,
    selectedDancerIds,
    selectedProfessorIds,
  } = useChoreographyRosterInitialState({
    actionData,
    choreography,
  });
  const form = useForm<ChoreographyEditValues>({
    resolver: zodResolver(choreographyEditSchema),
    defaultValues: buildChoreographyEditDefaultValues({
      actionData,
      choreography,
      selectedDancerIds,
      selectedProfessorIds,
    }),
  });
  const [derivedResolution, setDerivedResolution] =
    useState<DancerResolutionState>(persistedResolution);
  const [resolution, setResolution] =
    useState<ResolveChoreographyDancersResult | null>(null);
  const [resolvedSelectionKey, setResolvedSelectionKey] = useState(
    persistedSelectionKey,
  );
  const submittedSelectionKeyRef = useRef<string | null>(null);
  const {
    dancerSelectionKey,
    hasProfessorsChanged,
    hasRosterChanged,
    watchedDancerIds,
    watchedExperienceLevelId,
    watchedScheduleCapacityId,
  } = useWatchedChoreographyEditValues({
    form,
    persistedProfessorSelectionKey,
    persistedSelectionKey,
  });
  const { canEditDancers, canEditMusic, canEditProfessors } =
    getChoreographyEditPermissions({ choreography, loaderData });
  const isResolving = resolutionFetcher.state !== "idle";
  const isSubmitting = isSubmittingChoreographyUpdate(navigation);
  const hasResolvedRosterChange = hasResolvedRosterSelectionChange({
    dancerSelectionKey,
    hasRosterChanged,
    resolution,
    resolvedSelectionKey,
  });
  const resolutionData = resolutionFetcher.data;
  const scheduleResolution = getScheduleResolution(resolution);
  const {
    dancerOptions,
    experienceLevelOptions,
    professorOptions,
    scheduleSelectOptions,
  } = useChoreographyRosterEditorOptions({
    derivedResolution,
    loaderData,
    scheduleResolution,
  });
  const { readonlyExperienceLevelName, readonlyScheduleLabel } =
    getReadonlyChoreographyLabels({
      choreography,
      hasResolvedRosterChange,
      scheduleResolution,
    });
  const canSubmit = canSubmitChoreographyEdit({
    canEditDancers,
    canEditMusic,
    canEditProfessors,
    dancerSelectionKey,
    derivedResolution,
    hasMusicChanged,
    hasProfessorsChanged,
    hasRosterChanged,
    isResolving,
    isSubmitting,
    musicHasValidationError,
    resolution,
    resolvedSelectionKey,
    scheduleResolution,
    watchedDancerIds,
    watchedExperienceLevelId,
    watchedScheduleCapacityId,
  });

  useResetChoreographyEditForm({
    actionData,
    choreography,
    form,
    persistedResolution,
    persistedSelectionKey,
    selectedDancerIds,
    selectedProfessorIds,
    setDerivedResolution,
    setResolution,
    setResolvedSelectionKey,
    submittedSelectionKeyRef,
  });
  useResolveRosterSelection({
    canEditDancers,
    choreography,
    dancerSelectionKey,
    form,
    hasRosterChanged,
    persistedResolution,
    persistedSelectionKey,
    resolutionFetcher,
    resolvedSelectionKey,
    setDerivedResolution,
    setResolution,
    setResolvedSelectionKey,
    submittedSelectionKeyRef,
    watchedDancerIds,
  });
  useApplyRosterResolutionResult({
    dancerSelectionKey,
    derivedResolution,
    form,
    resolutionData,
    resolutionFetcherState: resolutionFetcher.state,
    setDerivedResolution,
    setResolution,
    setResolvedSelectionKey,
    submittedSelectionKeyRef,
    watchedScheduleCapacityId,
  });

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
    canEditMusic,
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

function isSubmittingChoreographyUpdate(
  navigation: ChoreographyEditNavigation,
) {
  return (
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === updateChoreographyIntent
  );
}

function useChoreographyRosterInitialState({
  actionData,
  choreography,
}: {
  actionData: ChoreographyRosterEditorActionData;
  choreography: ChoreographySummary;
}) {
  const initialDancerIds = useMemo(
    () => choreography.dancers.map((dancer) => dancer.id),
    [choreography.dancers],
  );
  const initialProfessorIds = useMemo(
    () => choreography.professors.map((professor) => professor.id),
    [choreography.professors],
  );
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

  return {
    persistedProfessorSelectionKey,
    persistedResolution,
    persistedSelectionKey,
    selectedDancerIds: actionData?.selectedDancerIds ?? initialDancerIds,
    selectedProfessorIds:
      actionData?.selectedProfessorIds ?? initialProfessorIds,
  };
}

function useWatchedChoreographyEditValues({
  form,
  persistedProfessorSelectionKey,
  persistedSelectionKey,
}: {
  form: ChoreographyEditForm;
  persistedProfessorSelectionKey: string;
  persistedSelectionKey: string;
}) {
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

  return {
    dancerSelectionKey,
    hasProfessorsChanged:
      professorSelectionKey !== persistedProfessorSelectionKey,
    hasRosterChanged: dancerSelectionKey !== persistedSelectionKey,
    watchedDancerIds,
    watchedExperienceLevelId,
    watchedScheduleCapacityId,
  };
}

function useChoreographyRosterEditorOptions({
  derivedResolution,
  loaderData,
  scheduleResolution,
}: {
  derivedResolution: DancerResolutionState;
  loaderData: ChoreographyRosterEditorLoaderData;
  scheduleResolution: ScheduleResolution;
}) {
  const scheduleOptions = getSelectableScheduleOptions(scheduleResolution);
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

  return {
    dancerOptions,
    experienceLevelOptions: derivedResolution.experienceLevelOptions.map(
      (option) => ({
        value: option.id,
        label: option.name,
      }),
    ),
    professorOptions,
    scheduleSelectOptions: scheduleOptions.map((option) => ({
      value: option.id,
      label: formatScheduleOptionDateTime(option),
    })),
  };
}

function useResetChoreographyEditForm({
  actionData,
  choreography,
  form,
  persistedResolution,
  persistedSelectionKey,
  selectedDancerIds,
  selectedProfessorIds,
  setDerivedResolution,
  setResolution,
  setResolvedSelectionKey,
  submittedSelectionKeyRef,
}: {
  actionData: ChoreographyRosterEditorActionData;
  choreography: ChoreographySummary;
  form: ChoreographyEditForm;
  persistedResolution: DancerResolutionState;
  persistedSelectionKey: string;
  selectedDancerIds: string[];
  selectedProfessorIds: string[];
  setDerivedResolution: Dispatch<SetStateAction<DancerResolutionState>>;
  setResolution: Dispatch<
    SetStateAction<ResolveChoreographyDancersResult | null>
  >;
  setResolvedSelectionKey: Dispatch<SetStateAction<string>>;
  submittedSelectionKeyRef: { current: string | null };
}) {
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
    actionData?.selectedMusicStorageKey,
    actionData?.selectedScheduleCapacityId,
    choreography.experienceLevelId,
    choreography.musicStorageKey,
    choreography.scheduleCapacityId,
    form,
    persistedResolution,
    persistedSelectionKey,
    selectedDancerIds,
    selectedProfessorIds,
    setDerivedResolution,
    setResolution,
    setResolvedSelectionKey,
    submittedSelectionKeyRef,
  ]);
}

function useResolveRosterSelection({
  canEditDancers,
  choreography,
  dancerSelectionKey,
  form,
  hasRosterChanged,
  persistedResolution,
  persistedSelectionKey,
  resolutionFetcher,
  resolvedSelectionKey,
  setDerivedResolution,
  setResolution,
  setResolvedSelectionKey,
  submittedSelectionKeyRef,
  watchedDancerIds,
}: {
  canEditDancers: boolean;
  choreography: ChoreographySummary;
  dancerSelectionKey: string;
  form: ChoreographyEditForm;
  hasRosterChanged: boolean;
  persistedResolution: DancerResolutionState;
  persistedSelectionKey: string;
  resolutionFetcher: RosterResolutionFetcher;
  resolvedSelectionKey: string;
  setDerivedResolution: Dispatch<SetStateAction<DancerResolutionState>>;
  setResolution: Dispatch<
    SetStateAction<ResolveChoreographyDancersResult | null>
  >;
  setResolvedSelectionKey: Dispatch<SetStateAction<string>>;
  submittedSelectionKeyRef: { current: string | null };
  watchedDancerIds: string[];
}) {
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
      !shouldResolveRosterSelection({
        canEditDancers,
        dancerSelectionKey,
        hasRosterChanged,
        resolvedSelectionKey,
        submittedSelectionKey: submittedSelectionKeyRef.current,
        watchedDancerIds,
      })
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
    setDerivedResolution,
    setResolution,
    setResolvedSelectionKey,
    submittedSelectionKeyRef,
    watchedDancerIds,
  ]);
}

function useApplyRosterResolutionResult({
  dancerSelectionKey,
  derivedResolution,
  form,
  resolutionData,
  resolutionFetcherState,
  setDerivedResolution,
  setResolution,
  setResolvedSelectionKey,
  submittedSelectionKeyRef,
  watchedScheduleCapacityId,
}: {
  dancerSelectionKey: string;
  derivedResolution: DancerResolutionState;
  form: ChoreographyEditForm;
  resolutionData: ChoreographyRosterEditorResolutionActionData | undefined;
  resolutionFetcherState: RosterResolutionFetcher["state"];
  setDerivedResolution: Dispatch<SetStateAction<DancerResolutionState>>;
  setResolution: Dispatch<
    SetStateAction<ResolveChoreographyDancersResult | null>
  >;
  setResolvedSelectionKey: Dispatch<SetStateAction<string>>;
  submittedSelectionKeyRef: { current: string | null };
  watchedScheduleCapacityId: string;
}) {
  useEffect(() => {
    if (
      resolutionFetcherState !== "idle" ||
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
    const nextFieldState = getResolvedRosterFieldState({
      derivedResolution,
      result: resolutionData.result,
      watchedScheduleCapacityId,
    });

    if (nextFieldState.shouldResetExperienceLevel) {
      form.setValue("experienceLevelId", "", { shouldDirty: true });
    }

    form.setValue("scheduleCapacityId", nextFieldState.nextScheduleCapacityId, {
      shouldDirty: true,
    });

    if (nextFieldState.shouldClearScheduleError) {
      form.clearErrors("scheduleCapacityId");
    }

    if (nextFieldState.scheduleError) {
      toast.error(nextFieldState.scheduleError, {
        id: choreographyResolutionErrorToastId,
      });
      form.setError("dancerIds", {
        message: nextFieldState.scheduleError,
        type: "manual",
      });
    }

    setDerivedResolution(nextFieldState.nextDerivedResolution);
  }, [
    dancerSelectionKey,
    derivedResolution.categoryId,
    form,
    resolutionData,
    resolutionFetcherState,
    setDerivedResolution,
    setResolution,
    setResolvedSelectionKey,
    submittedSelectionKeyRef,
    watchedScheduleCapacityId,
  ]);
}

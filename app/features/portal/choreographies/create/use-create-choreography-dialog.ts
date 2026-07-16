import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";
import { toast } from "sonner";

import type { ChoreographyRegistrationBaseOptions } from "@/lib/events/bases.server";
import { hasChoreographyNameContent } from "@/lib/choreographies/choreography-name";
import {
  buildCreateChoreographyFormData,
  buildResolveChoreographyFormData,
  CREATE_CHOREOGRAPHY_RESOLUTION_ERROR_TOAST_ID,
  createChoreographySchema,
  emptyCreateChoreographyValues,
  getCreateChoreographySteps,
  getFirstPostResolutionStepIndex,
  getSubmissionError,
  type RegistrationResolution,
  setRequiredFieldError,
} from "@/features/portal/choreographies/create/flow";
import type {
  CalculationActionData,
  CreateActionData,
  CreateChoreographyFormValues,
} from "@/features/portal/choreographies/create/flow";
import type { ActiveProfessor } from "@/features/portal/choreographies/create/shared";

export function useCreateChoreographyDialog({
  baseOptions,
  eventId,
  professors,
  onClose,
}: {
  baseOptions: ChoreographyRegistrationBaseOptions;
  eventId: string;
  professors: ActiveProfessor[];
  onClose: () => void;
}) {
  const calculationFetcher = useFetcher<CalculationActionData>();
  const submissionFetcher = useFetcher<CreateActionData>();
  const fieldIds = {
    experienceLevel: useId(),
    modality: useId(),
    name: useId(),
    scheduleCapacity: useId(),
    submodality: useId(),
  };
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [resolution, setResolution] = useState<RegistrationResolution | null>(
    null,
  );
  const hasSubmittedChoreographyRef = useRef(false);
  const processedCalculationDataRef = useRef<CalculationActionData | undefined>(
    undefined,
  );
  const form = useForm<CreateChoreographyFormValues>({
    resolver: zodResolver(createChoreographySchema),
    defaultValues: emptyCreateChoreographyValues,
  });

  const watchedValues = form.watch();
  const selectedModalityId = watchedValues.modalityId;
  const selectedSubmodalityId = watchedValues.submodalityId ?? "";
  const selectedDancerIds = watchedValues.dancerIds;
  const selectedProfessorIds = watchedValues.professorIds;
  const selectedExperienceLevelId = watchedValues.experienceLevelId ?? "";
  const selectedScheduleCapacityId = watchedValues.scheduleCapacityId ?? "";
  const selectedSubmodalities = useMemo(
    () =>
      baseOptions.submodalities.filter(
        (submodality) => submodality.modalityId === selectedModalityId,
      ),
    [baseOptions.submodalities, selectedModalityId],
  );
  const selectedProfessors = useMemo(
    () =>
      professors.filter((professor) =>
        selectedProfessorIds.includes(professor.id),
      ),
    [professors, selectedProfessorIds],
  );
  const calculationData = calculationFetcher.data;
  const canChooseSubmodality = selectedSubmodalities.length > 0;
  const isResolving = calculationFetcher.state !== "idle";
  const isSubmitting = submissionFetcher.state !== "idle";
  const submissionError = getSubmissionError(submissionFetcher.data);
  const registrationSteps = useMemo(
    () => getCreateChoreographySteps({ canChooseSubmodality, resolution }),
    [canChooseSubmodality, resolution],
  );
  const currentStep = registrationSteps[currentStepIndex] ?? "name";

  useEffect(() => {
    if (!calculationData) {
      return;
    }

    if (processedCalculationDataRef.current === calculationData) {
      return;
    }

    processedCalculationDataRef.current = calculationData;

    if (!calculationData.result.ok) {
      toast.error(calculationData.result.error, {
        id: CREATE_CHOREOGRAPHY_RESOLUTION_ERROR_TOAST_ID,
      });
      return;
    }

    const nextResolution = calculationData.result.resolution;
    const currentExperienceLevelId = form.getValues("experienceLevelId") ?? "";
    const currentScheduleCapacityId =
      form.getValues("scheduleCapacityId") ?? "";

    if (nextResolution.schedule.status === "none") {
      setResolution(null);
      form.setValue("scheduleCapacityId", "", { shouldDirty: true });
      toast.error(nextResolution.schedule.error, {
        id: CREATE_CHOREOGRAPHY_RESOLUTION_ERROR_TOAST_ID,
      });
      return;
    }

    setResolution(nextResolution);

    if (nextResolution.experienceLevel.required) {
      if (
        !nextResolution.experienceLevel.options.some(
          (option) => option.id === currentExperienceLevelId,
        )
      ) {
        form.setValue("experienceLevelId", "", { shouldDirty: true });
      }
    } else {
      form.setValue("experienceLevelId", "", { shouldDirty: true });
    }

    if (nextResolution.schedule.status === "auto") {
      form.setValue(
        "scheduleCapacityId",
        nextResolution.schedule.scheduleCapacityId,
        { shouldDirty: true },
      );
    } else if (
      nextResolution.schedule.status === "multiple" &&
      !nextResolution.schedule.options.some(
        (option) => option.id === currentScheduleCapacityId,
      )
    ) {
      form.setValue("scheduleCapacityId", "", { shouldDirty: true });
    }

    setCurrentStepIndex(
      getFirstPostResolutionStepIndex({
        canChooseSubmodality,
        resolution: nextResolution,
      }),
    );
  }, [calculationData, canChooseSubmodality, form]);

  useEffect(() => {
    if (!hasSubmittedChoreographyRef.current) {
      return;
    }

    if (submissionFetcher.state !== "idle") {
      return;
    }

    if (submissionError) {
      return;
    }

    hasSubmittedChoreographyRef.current = false;
    onClose();
  }, [onClose, submissionError, submissionFetcher.state]);

  function resetResolutionState() {
    setResolution(null);
    form.setValue("experienceLevelId", "", { shouldDirty: true });
    form.setValue("scheduleCapacityId", "", { shouldDirty: true });
    form.clearErrors([
      "submodalityId",
      "experienceLevelId",
      "scheduleCapacityId",
    ]);
  }

  async function handleAdvanceFromName() {
    if (await form.trigger("name")) {
      setCurrentStepIndex(1);
    }
  }

  async function handleAdvanceFromModality() {
    if (!(await form.trigger("modalityId"))) {
      return;
    }

    form.clearErrors("submodalityId");
    setCurrentStepIndex((stepIndex) => stepIndex + 1);
  }

  function handleAdvanceFromSubmodality() {
    if (canChooseSubmodality && !selectedSubmodalityId) {
      setRequiredFieldError(form, "submodalityId");
      return;
    }

    form.clearErrors("submodalityId");
    setCurrentStepIndex((stepIndex) => stepIndex + 1);
  }

  function handleResolveStep() {
    calculationFetcher.submit(
      buildResolveChoreographyFormData({
        eventId,
        modalityId: selectedModalityId,
        submodalityId: selectedSubmodalityId,
        canChooseSubmodality,
        dancerIds: selectedDancerIds,
      }),
      { method: "post" },
    );
  }

  function handleAdvanceFromExperienceLevel() {
    if (!resolution) {
      return;
    }

    if (resolution.experienceLevel.required && !selectedExperienceLevelId) {
      setRequiredFieldError(form, "experienceLevelId");
      return;
    }

    form.clearErrors("experienceLevelId");
    setCurrentStepIndex((stepIndex) => stepIndex + 1);
  }

  function handleAdvanceFromSchedule() {
    if (!resolution) {
      return;
    }

    if (
      resolution.schedule.status === "multiple" &&
      !selectedScheduleCapacityId
    ) {
      setRequiredFieldError(form, "scheduleCapacityId");
      return;
    }

    form.clearErrors("scheduleCapacityId");
    setCurrentStepIndex((stepIndex) => stepIndex + 1);
  }

  function handleConfirm() {
    hasSubmittedChoreographyRef.current = true;
    submissionFetcher.submit(
      buildCreateChoreographyFormData({
        eventId,
        name: watchedValues.name,
        modalityId: selectedModalityId,
        submodalityId: selectedSubmodalityId,
        canChooseSubmodality,
        dancerIds: selectedDancerIds,
        professorIds: selectedProfessorIds,
        experienceLevelId: selectedExperienceLevelId,
        scheduleCapacityId: selectedScheduleCapacityId,
      }),
      { method: "post" },
    );
  }

  function handlePrevious() {
    if (currentStepIndex === 0) {
      onClose();
      return;
    }

    setCurrentStepIndex((stepIndex) => stepIndex - 1);
  }

  function handleAdvanceFromProfessors() {
    setCurrentStepIndex((stepIndex) => stepIndex + 1);
  }

  const canAdvanceFromName = hasChoreographyNameContent(watchedValues.name);
  const canAdvanceFromModality = selectedModalityId.length > 0;
  const canAdvanceFromSubmodality =
    !canChooseSubmodality || selectedSubmodalityId.length > 0;
  const canResolve = selectedDancerIds.length > 0;
  const canAdvanceFromProfessors = selectedProfessorIds.length > 0;
  const hasRequiredExperienceLevel =
    resolution !== null &&
    (!resolution.experienceLevel.required ||
      selectedExperienceLevelId.length > 0);
  const hasRequiredSchedule =
    resolution !== null &&
    (resolution.schedule.status === "auto" ||
      (resolution.schedule.status === "multiple" &&
        selectedScheduleCapacityId.length > 0));

  return {
    canAdvanceFromExperienceLevel:
      resolution !== null && hasRequiredExperienceLevel,
    canAdvanceFromModality,
    canAdvanceFromName,
    canAdvanceFromProfessors,
    canAdvanceFromSchedule: resolution !== null && hasRequiredSchedule,
    canAdvanceFromSubmodality,
    canChooseSubmodality,
    canResolve,
    currentStep,
    currentStepIndex,
    fieldIds,
    form,
    handleAdvanceFromExperienceLevel,
    handleAdvanceFromModality,
    handleAdvanceFromName,
    handleAdvanceFromProfessors,
    handleAdvanceFromSchedule,
    handleAdvanceFromSubmodality,
    handleConfirm,
    handlePrevious,
    handleResolveStep,
    isResolving,
    isSubmitting,
    progressValue: ((currentStepIndex + 1) / registrationSteps.length) * 100,
    registrationSteps,
    resetResolutionState,
    resolution,
    selectedExperienceLevelId,
    selectedModalityId,
    selectedProfessors,
    selectedScheduleCapacityId,
    selectedSubmodalities,
    selectedSubmodalityId,
    submissionError,
    watchedValues,
  };
}

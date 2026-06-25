import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";
import { toast } from "sonner";

import { AccessNotice } from "@/components/auth/access-ui";
import {
  CreateChoreographyDancersField,
  CreateChoreographyProfessorsField,
  CreateChoreographySelectField,
  CreateChoreographyTextField,
} from "@/components/portal/choreography-create-dialog/fields";
import { formatScheduleDateTime } from "@/components/portal/choreography-create-dialog/formatters";
import { ChoreographyCreationSummary } from "@/components/portal/choreography-create-dialog/summary";
import type {
  ActiveDancer,
  ActiveProfessor,
} from "@/components/portal/choreography-create-dialog/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import type { ChoreographyRegistrationBaseOptions } from "@/lib/events/bases.server";
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
} from "@/lib/portal/choreography-create-flow";
import type {
  CalculationActionData,
  CreateActionData,
  CreateChoreographyFormValues,
} from "@/lib/portal/choreography-create-flow";

export function CreateChoreographyDialog({
  baseOptions,
  dancers,
  eventId,
  professors,
  onClose,
}: {
  baseOptions: ChoreographyRegistrationBaseOptions;
  dancers: ActiveDancer[];
  eventId: string;
  professors: ActiveProfessor[];
  onClose: () => void;
}) {
  const calculationFetcher = useFetcher<CalculationActionData>();
  const submissionFetcher = useFetcher<CreateActionData>();
  const nameFieldId = useId();
  const modalityFieldId = useId();
  const submodalityFieldId = useId();
  const experienceLevelFieldId = useId();
  const scheduleCapacityFieldId = useId();
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

  const canAdvanceFromName = watchedValues.name.trim().length > 0;
  const canAdvanceFromModality = selectedModalityId.length > 0;
  const canAdvanceFromSubmodality =
    !canChooseSubmodality || selectedSubmodalityId.length > 0;
  const canResolve = selectedDancerIds.length > 0;
  const hasRequiredExperienceLevel =
    resolution !== null &&
    (!resolution.experienceLevel.required ||
      selectedExperienceLevelId.length > 0);
  const hasRequiredSchedule =
    resolution !== null &&
    (resolution.schedule.status === "auto" ||
      (resolution.schedule.status === "multiple" &&
        selectedScheduleCapacityId.length > 0));
  const canAdvanceFromExperienceLevel =
    resolution !== null && hasRequiredExperienceLevel;
  const canAdvanceFromSchedule = resolution !== null && hasRequiredSchedule;
  const progressValue =
    ((currentStepIndex + 1) / registrationSteps.length) * 100;

  return (
    <Dialog open onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-visible"
        overlayClassName="backdrop-blur-sm"
      >
        <DialogHeader>
          <DialogTitle>Nueva coreografía</DialogTitle>
          <DialogDescription>
            Completá los siguientes pasos para registrarla en el evento.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex min-h-0 flex-col gap-6 overflow-y-auto px-1">
          <Field>
            <div className="flex justify-end">
              <span className="text-sm text-muted-foreground">
                Paso {currentStepIndex + 1} de {registrationSteps.length}
              </span>
            </div>
            <Progress value={progressValue} />
          </Field>

          {submissionError ? (
            <AccessNotice variant="error">{submissionError}</AccessNotice>
          ) : null}

          <div className="flex flex-col gap-6">
            {currentStep === "name" ? (
              <section className="flex flex-col gap-4">
                <CreateChoreographyTextField
                  control={form.control}
                  fieldName="name"
                  id={nameFieldId}
                  label="Nombre"
                  placeholder="Ej.: Danza de la luna"
                />
              </section>
            ) : null}

            {currentStep === "modality" ? (
              <section className="flex flex-col gap-4">
                <CreateChoreographySelectField
                  control={form.control}
                  fieldName="modalityId"
                  id={modalityFieldId}
                  label="Modalidad"
                  onValueChange={() => {
                    form.setValue("submodalityId", "", { shouldDirty: true });
                    resetResolutionState();
                  }}
                  options={baseOptions.modalities.map((modality) => ({
                    value: modality.id,
                    label: modality.name,
                  }))}
                />
              </section>
            ) : null}

            {currentStep === "submodality" ? (
              <section className="flex flex-col gap-4">
                <CreateChoreographySelectField
                  control={form.control}
                  fieldName="submodalityId"
                  id={submodalityFieldId}
                  label="Submodalidad"
                  onValueChange={resetResolutionState}
                  options={selectedSubmodalities.map((submodality) => ({
                    value: submodality.id,
                    label: submodality.name,
                  }))}
                />
              </section>
            ) : null}

            {currentStep === "dancers" ? (
              <section className="flex flex-col gap-6">
                <CreateChoreographyDancersField
                  control={form.control}
                  dancers={dancers}
                  onValueChange={resetResolutionState}
                />
              </section>
            ) : null}

            {currentStep === "experienceLevel" && resolution ? (
              <section className="flex flex-col gap-5">
                <CreateChoreographySelectField
                  control={form.control}
                  fieldName="experienceLevelId"
                  id={experienceLevelFieldId}
                  label="Nivel de experiencia"
                  options={resolution.experienceLevel.options.map((option) => ({
                    value: option.id,
                    label: option.name,
                  }))}
                />
              </section>
            ) : null}

            {currentStep === "schedule" && resolution ? (
              <section className="flex flex-col gap-5">
                <CreateChoreographySelectField
                  control={form.control}
                  fieldName="scheduleCapacityId"
                  id={scheduleCapacityFieldId}
                  label="Cronograma"
                  options={
                    resolution.schedule.status === "multiple"
                      ? resolution.schedule.options.map((option) => ({
                          value: option.id,
                          label: formatScheduleDateTime(option.schedule),
                        }))
                      : []
                  }
                />
              </section>
            ) : null}

            {currentStep === "professors" ? (
              <section className="flex flex-col gap-6">
                <CreateChoreographyProfessorsField
                  control={form.control}
                  professors={professors}
                />
              </section>
            ) : null}

            {currentStep === "summary" && resolution ? (
              <ChoreographyCreationSummary
                baseOptions={baseOptions}
                name={watchedValues.name}
                resolution={resolution}
                selectedExperienceLevelId={selectedExperienceLevelId}
                selectedModalityId={selectedModalityId}
                selectedProfessors={selectedProfessors}
                selectedScheduleCapacityId={selectedScheduleCapacityId}
                selectedSubmodalityId={selectedSubmodalityId}
              />
            ) : null}
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={
              currentStepIndex === 0
                ? onClose
                : () => setCurrentStepIndex((stepIndex) => stepIndex - 1)
            }
          >
            {currentStepIndex === 0 ? null : (
              <ChevronLeft aria-hidden="true" data-icon />
            )}
            {currentStepIndex === 0 ? "Cancelar" : "Anterior"}
          </Button>

          <div className="flex flex-col gap-3 sm:flex-row">
            {currentStep === "name" ? (
              <Button
                type="button"
                disabled={!canAdvanceFromName}
                onClick={() => void handleAdvanceFromName()}
              >
                Siguiente
                <ChevronRight aria-hidden="true" data-icon />
              </Button>
            ) : null}

            {currentStep === "modality" ? (
              <Button
                type="button"
                disabled={!canAdvanceFromModality}
                onClick={() => void handleAdvanceFromModality()}
              >
                Siguiente
                <ChevronRight aria-hidden="true" data-icon />
              </Button>
            ) : null}

            {currentStep === "submodality" ? (
              <Button
                type="button"
                disabled={!canAdvanceFromSubmodality}
                onClick={handleAdvanceFromSubmodality}
              >
                Siguiente
                <ChevronRight aria-hidden="true" data-icon />
              </Button>
            ) : null}

            {currentStep === "dancers" ? (
              <Button
                type="button"
                disabled={!canResolve || isResolving}
                onClick={handleResolveStep}
              >
                Siguiente
                {isResolving ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin"
                    data-icon
                  />
                ) : (
                  <ChevronRight aria-hidden="true" data-icon />
                )}
              </Button>
            ) : null}

            {currentStep === "experienceLevel" ? (
              <Button
                type="button"
                disabled={!canAdvanceFromExperienceLevel}
                onClick={handleAdvanceFromExperienceLevel}
              >
                Siguiente
                <ChevronRight aria-hidden="true" data-icon />
              </Button>
            ) : null}

            {currentStep === "schedule" ? (
              <Button
                type="button"
                disabled={!canAdvanceFromSchedule}
                onClick={handleAdvanceFromSchedule}
              >
                Siguiente
                <ChevronRight aria-hidden="true" data-icon />
              </Button>
            ) : null}

            {currentStep === "professors" ? (
              <Button
                type="button"
                onClick={() =>
                  setCurrentStepIndex((stepIndex) => stepIndex + 1)
                }
              >
                Siguiente
                <ChevronRight aria-hidden="true" data-icon />
              </Button>
            ) : null}

            {currentStep === "summary" ? (
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirm}
              >
                {isSubmitting ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin"
                    data-icon
                  />
                ) : (
                  <Check aria-hidden="true" data-icon />
                )}
                Guardar
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

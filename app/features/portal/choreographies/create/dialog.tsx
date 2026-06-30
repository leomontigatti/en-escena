import { Check, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";

import { AccessNotice } from "@/components/auth/access-ui";
import {
  CreateChoreographyDancersField,
  CreateChoreographyProfessorsField,
  CreateChoreographySelectField,
  CreateChoreographyTextField,
} from "@/features/portal/choreographies/create/fields";
import { formatScheduleDateTime } from "@/features/portal/choreographies/create/formatters";
import { ChoreographyCreationSummary } from "@/features/portal/choreographies/create/summary";
import type {
  ActiveDancer,
  ActiveProfessor,
} from "@/features/portal/choreographies/create/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import type { ChoreographyRegistrationBaseOptions } from "@/lib/events/bases.server";
import { useCreateChoreographyDialog } from "@/features/portal/choreographies/create/use-create-choreography-dialog";

type CreateChoreographyDialogState = ReturnType<
  typeof useCreateChoreographyDialog
>;

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
  const dialog = useCreateChoreographyDialog({
    baseOptions,
    eventId,
    professors,
    onClose,
  });
  const {
    currentStepIndex,
    handlePrevious,
    progressValue,
    registrationSteps,
    submissionError,
  } = dialog;

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
            <CreateChoreographyStepContent
              baseOptions={baseOptions}
              dancers={dancers}
              dialog={dialog}
              professors={professors}
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={handlePrevious}>
            {currentStepIndex === 0 ? null : (
              <ChevronLeft aria-hidden="true" data-icon />
            )}
            {currentStepIndex === 0 ? "Cancelar" : "Anterior"}
          </Button>

          <div className="flex flex-col gap-3 sm:flex-row">
            <CreateChoreographyFooterAction dialog={dialog} />
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateChoreographyStepContent({
  baseOptions,
  dancers,
  dialog,
  professors,
}: {
  baseOptions: ChoreographyRegistrationBaseOptions;
  dancers: ActiveDancer[];
  dialog: CreateChoreographyDialogState;
  professors: ActiveProfessor[];
}) {
  const {
    currentStep,
    fieldIds,
    form,
    resetResolutionState,
    resolution,
    selectedExperienceLevelId,
    selectedModalityId,
    selectedProfessors,
    selectedScheduleCapacityId,
    selectedSubmodalities,
    selectedSubmodalityId,
    watchedValues,
  } = dialog;

  const stepContent = {
    name: (
      <section className="flex flex-col gap-4">
        <CreateChoreographyTextField
          control={form.control}
          fieldName="name"
          id={fieldIds.name}
          label="Nombre"
          placeholder="Una vez guardado no puede modificarse"
        />
      </section>
    ),
    modality: (
      <section className="flex flex-col gap-4">
        <CreateChoreographySelectField
          control={form.control}
          fieldName="modalityId"
          id={fieldIds.modality}
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
    ),
    submodality: (
      <section className="flex flex-col gap-4">
        <CreateChoreographySelectField
          control={form.control}
          fieldName="submodalityId"
          id={fieldIds.submodality}
          label="Submodalidad"
          onValueChange={resetResolutionState}
          options={selectedSubmodalities.map((submodality) => ({
            value: submodality.id,
            label: submodality.name,
          }))}
        />
      </section>
    ),
    dancers: (
      <section className="flex flex-col gap-6">
        <CreateChoreographyDancersField
          control={form.control}
          dancers={dancers}
          onValueChange={resetResolutionState}
        />
      </section>
    ),
    experienceLevel: resolution ? (
      <section className="flex flex-col gap-5">
        <CreateChoreographySelectField
          control={form.control}
          fieldName="experienceLevelId"
          id={fieldIds.experienceLevel}
          label="Nivel de experiencia"
          options={resolution.experienceLevel.options.map((option) => ({
            value: option.id,
            label: option.name,
          }))}
        />
      </section>
    ) : null,
    schedule: resolution ? (
      <section className="flex flex-col gap-5">
        <CreateChoreographySelectField
          control={form.control}
          fieldName="scheduleCapacityId"
          id={fieldIds.scheduleCapacity}
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
    ) : null,
    professors: (
      <section className="flex flex-col gap-6">
        <CreateChoreographyProfessorsField
          control={form.control}
          professors={professors}
        />
      </section>
    ),
    summary: resolution ? (
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
    ) : null,
  };

  return stepContent[currentStep];
}

function CreateChoreographyFooterAction({
  dialog,
}: {
  dialog: CreateChoreographyDialogState;
}) {
  const {
    canAdvanceFromExperienceLevel,
    canAdvanceFromModality,
    canAdvanceFromName,
    canAdvanceFromSchedule,
    canAdvanceFromSubmodality,
    canResolve,
    currentStep,
    handleAdvanceFromExperienceLevel,
    handleAdvanceFromModality,
    handleAdvanceFromName,
    handleAdvanceFromProfessors,
    handleAdvanceFromSchedule,
    handleAdvanceFromSubmodality,
    handleConfirm,
    handleResolveStep,
    isResolving,
    isSubmitting,
  } = dialog;

  const footerActions = {
    name: (
      <Button
        type="button"
        disabled={!canAdvanceFromName}
        onClick={() => void handleAdvanceFromName()}
      >
        Siguiente
        <ChevronRight aria-hidden="true" data-icon />
      </Button>
    ),
    modality: (
      <Button
        type="button"
        disabled={!canAdvanceFromModality}
        onClick={() => void handleAdvanceFromModality()}
      >
        Siguiente
        <ChevronRight aria-hidden="true" data-icon />
      </Button>
    ),
    submodality: (
      <Button
        type="button"
        disabled={!canAdvanceFromSubmodality}
        onClick={handleAdvanceFromSubmodality}
      >
        Siguiente
        <ChevronRight aria-hidden="true" data-icon />
      </Button>
    ),
    dancers: (
      <Button
        type="button"
        disabled={!canResolve || isResolving}
        onClick={handleResolveStep}
      >
        Siguiente
        {isResolving ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" data-icon />
        ) : (
          <ChevronRight aria-hidden="true" data-icon />
        )}
      </Button>
    ),
    experienceLevel: (
      <Button
        type="button"
        disabled={!canAdvanceFromExperienceLevel}
        onClick={handleAdvanceFromExperienceLevel}
      >
        Siguiente
        <ChevronRight aria-hidden="true" data-icon />
      </Button>
    ),
    schedule: (
      <Button
        type="button"
        disabled={!canAdvanceFromSchedule}
        onClick={handleAdvanceFromSchedule}
      >
        Siguiente
        <ChevronRight aria-hidden="true" data-icon />
      </Button>
    ),
    professors: (
      <Button type="button" onClick={handleAdvanceFromProfessors}>
        Siguiente
        <ChevronRight aria-hidden="true" data-icon />
      </Button>
    ),
    summary: (
      <Button type="button" disabled={isSubmitting} onClick={handleConfirm}>
        {isSubmitting ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" data-icon />
        ) : (
          <Check aria-hidden="true" data-icon />
        )}
        Guardar
      </Button>
    ),
  };

  return footerActions[currentStep];
}

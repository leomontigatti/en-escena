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
import { Field, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import type { ChoreographyRegistrationBaseOptions } from "@/lib/events/bases.server";
import { useCreateChoreographyDialog } from "@/features/portal/choreographies/create/use-create-choreography-dialog";

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
    canAdvanceFromExperienceLevel,
    canAdvanceFromModality,
    canAdvanceFromName,
    canAdvanceFromSchedule,
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
    progressValue,
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
  } = dialog;
  const experienceLevelFieldId = fieldIds.experienceLevel;
  const modalityFieldId = fieldIds.modality;
  const nameFieldId = fieldIds.name;
  const scheduleCapacityFieldId = fieldIds.scheduleCapacity;
  const submodalityFieldId = fieldIds.submodality;

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
          <Button type="button" variant="outline" onClick={handlePrevious}>
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
              <Button type="button" onClick={handleAdvanceFromProfessors}>
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

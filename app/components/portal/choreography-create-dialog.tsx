import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { useFetcher } from "react-router";
import { toast } from "sonner";

import { AccessNotice } from "@/components/auth/access-ui";
import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChoreographyRegistrationBaseOptions } from "@/lib/events/bases.server";
import {
  buildCreateChoreographyFormData,
  buildResolveChoreographyFormData,
  CREATE_CHOREOGRAPHY_RESOLUTION_ERROR_TOAST_ID,
  createChoreographySchema,
  emptyCreateChoreographyValues,
  formatGroupTypeLabel,
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

type ActiveDancer = {
  id: string;
  firstName: string;
  lastName: string;
};

type ActiveProfessor = {
  id: string;
  firstName: string;
  lastName: string;
};

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

        <div className="flex min-h-0 flex-col gap-6 overflow-y-auto">
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
                <ChoreographyTextField
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
                <ChoreographySelectField
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
                <ChoreographySelectField
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
                <MultiComboboxField
                  control={form.control}
                  name="dancerIds"
                  label="Bailarines"
                  options={dancers.map((dancer) => ({
                    value: dancer.id,
                    label: `${dancer.firstName} ${dancer.lastName}`,
                  }))}
                  placeholder="Seleccionar bailarines"
                  emptyMessage="Sin bailarines disponibles"
                  onValueChange={resetResolutionState}
                  searchable={true}
                />
              </section>
            ) : null}

            {currentStep === "experienceLevel" && resolution ? (
              <section className="flex flex-col gap-5">
                <ChoreographySelectField
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
                <ChoreographySelectField
                  control={form.control}
                  fieldName="scheduleCapacityId"
                  id={scheduleCapacityFieldId}
                  label="Cupo de cronograma"
                  options={
                    resolution.schedule.status === "multiple"
                      ? resolution.schedule.options.map((option) => ({
                          value: option.id,
                          label: `${option.schedule.name} · ${formatGroupTypeLabel(option.groupType)} · Cupo ${option.capacity}`,
                        }))
                      : []
                  }
                />
              </section>
            ) : null}

            {currentStep === "professors" ? (
              <section className="flex flex-col gap-6">
                <MultiComboboxField
                  control={form.control}
                  name="professorIds"
                  label="Profesores"
                  options={professors.map((professor) => ({
                    value: professor.id,
                    label: `${professor.firstName} ${professor.lastName}`,
                  }))}
                  placeholder="Seleccionar profesores"
                  emptyMessage="Sin profesores disponibles"
                  searchable={true}
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

function ChoreographyCreationSummary({
  baseOptions,
  name,
  resolution,
  selectedExperienceLevelId,
  selectedModalityId,
  selectedProfessors,
  selectedScheduleCapacityId,
  selectedSubmodalityId,
}: {
  baseOptions: ChoreographyRegistrationBaseOptions;
  name: string;
  resolution: RegistrationResolution;
  selectedExperienceLevelId: string;
  selectedModalityId: string;
  selectedProfessors: ActiveProfessor[];
  selectedScheduleCapacityId: string;
  selectedSubmodalityId: string;
}) {
  const summaryItems = [
    {
      label: "Nombre",
      value: name.trim() || "Sin nombre",
    },
    {
      label: "Modalidad",
      value: formatModalitySummary(
        baseOptions,
        selectedModalityId,
        selectedSubmodalityId,
      ),
    },
    {
      label: "Categoría",
      value: formatCategoryAndGroupTypeSummary(resolution),
    },
  ];

  if (resolution.experienceLevel.required) {
    summaryItems.push({
      label: "Nivel de experiencia",
      value: formatExperienceLevelSummary(
        resolution,
        selectedExperienceLevelId,
      ),
    });
  }

  summaryItems.push(
    {
      label: "Cronograma",
      value: formatScheduleSummary(resolution, selectedScheduleCapacityId),
    },
    {
      label: "Bailarines",
      value: formatPeopleSummary(
        resolution.dancers.map((dancer) => ({
          firstName: dancer.firstName,
          lastName: dancer.lastName,
        })),
        "bailarines",
      ),
    },
    {
      label: "Profesores",
      value: formatPeopleSummary(selectedProfessors, "profesores"),
    },
  );

  return (
    <section aria-label="Resumen de coreografía">
      <FieldLabel>Resumen</FieldLabel>
      <dl className="mt-3 flex flex-col gap-3">
        {summaryItems.map((item) => (
          <div key={item.label} className="flex items-baseline gap-3">
            <dt className="min-w-40 text-xs font-semibold uppercase text-muted-foreground">
              {item.label}
            </dt>
            <dd className="text-sm">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ChoreographyTextField({
  control,
  fieldName,
  id,
  label,
  placeholder,
}: {
  control: Control<CreateChoreographyFormValues>;
  fieldName: "name";
  id: string;
  label: string;
  placeholder?: string;
}) {
  return (
    <Controller
      control={control}
      name={fieldName}
      render={({ field, fieldState }) => {
        const isInvalid = Boolean(fieldState.error?.message);

        return (
          <Field data-invalid={isInvalid ? true : undefined}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <FieldContent>
              <Input
                {...field}
                id={id}
                placeholder={placeholder}
                aria-invalid={isInvalid ? true : undefined}
              />
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        );
      }}
    />
  );
}

function ChoreographySelectField({
  control,
  fieldName,
  id,
  label,
  onValueChange,
  options,
}: {
  control: Control<CreateChoreographyFormValues>;
  fieldName:
    | "modalityId"
    | "submodalityId"
    | "experienceLevelId"
    | "scheduleCapacityId";
  id: string;
  label: string;
  onValueChange?: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Controller
      control={control}
      name={fieldName}
      render={({ field, fieldState }) => {
        const isInvalid = Boolean(fieldState.error?.message);

        return (
          <Field data-invalid={isInvalid ? true : undefined}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <FieldContent>
              <Select
                name={field.name}
                value={field.value ?? ""}
                onValueChange={(value) => {
                  field.onChange(value);
                  onValueChange?.(value);
                }}
              >
                <SelectTrigger
                  id={id}
                  aria-invalid={isInvalid ? true : undefined}
                  className="w-full"
                >
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  side="bottom"
                  align="start"
                  avoidCollisions={false}
                >
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        );
      }}
    />
  );
}

function formatModalitySummary(
  baseOptions: ChoreographyRegistrationBaseOptions,
  modalityId: string,
  submodalityId: string,
) {
  const modalityName =
    baseOptions.modalities.find((modality) => modality.id === modalityId)
      ?.name ?? "Pendiente";
  const submodalityName = submodalityId
    ? (baseOptions.submodalities.find(
        (submodality) => submodality.id === submodalityId,
      )?.name ?? null)
    : null;

  return submodalityName
    ? `${modalityName} - ${submodalityName}`
    : modalityName;
}

function formatCategoryAndGroupTypeSummary(resolution: RegistrationResolution) {
  const categoryName =
    resolution.category.status === "resolved"
      ? resolution.category.name
      : "Sin confirmar";

  return `${categoryName} - ${formatGroupTypeLabel(resolution.groupType)}`;
}

function formatExperienceLevelSummary(
  resolution: RegistrationResolution,
  selectedExperienceLevelId: string,
) {
  return (
    resolution.experienceLevel.options.find(
      (option) => option.id === selectedExperienceLevelId,
    )?.name ?? "Pendiente"
  );
}

function formatScheduleSummary(
  resolution: RegistrationResolution,
  scheduleCapacityId: string,
) {
  const selectedOption =
    resolution.schedule.status === "auto"
      ? resolution.schedule.options[0]
      : resolution.schedule.options.find(
          (option) => option.id === scheduleCapacityId,
        );

  if (!selectedOption) {
    return "Pendiente";
  }

  return formatScheduleDateTime(selectedOption.schedule);
}

function formatScheduleDateTime(input: {
  name: string;
  scheduledDate: string;
  startTime: string;
}) {
  const [year, month, day] = input.scheduledDate.split("-").map(Number);

  if (!year || !month || !day) {
    return input.name;
  }

  const date = new Date(year, month - 1, day);
  const weekday = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
  }).format(date);
  const formattedDate = `${String(day).padStart(2, "0")}/${String(
    month,
  ).padStart(2, "0")}`;
  const formattedTime = input.startTime.slice(0, 5);

  return `${capitalizeFirstLetter(weekday)} ${formattedDate} - ${formattedTime} hs.`;
}

function capitalizeFirstLetter(value: string) {
  return value.charAt(0).toLocaleUpperCase("es-AR") + value.slice(1);
}

function formatPeopleSummary(
  people: Array<{ firstName: string; lastName: string }>,
  noun: "bailarines" | "profesores",
) {
  if (people.length === 0) {
    if (noun === "profesores") {
      return "Sin profesores seleccionados";
    }

    return "Sin bailarines seleccionados";
  }

  if (people.length > 3) {
    return `${people.length} ${noun} seleccionados`;
  }

  return people
    .map((person) => `${person.firstName} ${person.lastName}`)
    .join(" - ");
}

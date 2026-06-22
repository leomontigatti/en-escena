import { Check, LoaderCircle, Lock } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type SubmitEvent,
} from "react";
import { Controller, useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Link, useFetcher, useNavigation } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import {
  formatGroupTypeLabel,
  type ChoreographyGroupType,
  type ChoreographyOperationalStatus,
} from "@/lib/portal/choreographies";
import type {
  ChoreographyDancerOption,
  ChoreographyProfessorOption,
  DancerEditingEligibility,
  ResolveChoreographyDancersResult,
} from "@/lib/portal/choreographies.server";

export const choreographyResolutionErrorToastId =
  "coreografia-resolution-error";
export const resolveChoreographyDancersIntent = "resolve-choreography-dancers";
export const updateChoreographyIntent = "update-choreography";
export const rosterEditorReviewMessage =
  "Revisá los bailarines de la coreografía.";

export const choreographyEditSchema = z.object({
  dancerIds: z.array(z.string().trim().min(1)).min(1, requiredFieldMessage),
  professorIds: z.array(z.string().trim().min(1)),
  experienceLevelId: z.string().trim().optional(),
  scheduleCapacityId: z.string().trim().optional(),
});

export type ChoreographyEditValues = z.infer<typeof choreographyEditSchema>;
export type ChoreographyEditFieldErrors = {
  dancerIds?: string;
  experienceLevelId?: string;
  scheduleCapacityId?: string;
};

type DancerResolutionActionData = {
  intent: typeof resolveChoreographyDancersIntent;
  result: ResolveChoreographyDancersResult;
};

export type CoreografiaPeopleEditorActionData =
  | {
      status: "update-error";
      section: "dancers";
      fieldErrors?: ChoreographyEditFieldErrors;
      message: string;
      selectedDancerIds: string[];
      selectedProfessorIds: string[];
      selectedExperienceLevelId: string | null;
      selectedScheduleCapacityId?: string;
    }
  | {
      status: "update-error";
      section: "professors";
      message: string;
      selectedDancerIds: string[];
      selectedProfessorIds: string[];
      selectedExperienceLevelId: string | null;
      selectedScheduleCapacityId?: string;
    }
  | undefined;

type ChoreographyProfessor = ChoreographyProfessorOption;

type ChoreographyDancer = ChoreographyDancerOption & {
  ageAtEventStart: number | null;
};

type ChoreographySummary = {
  id: string;
  name: string;
  modalityName: string;
  submodalityName: string | null;
  hasPresentation?: boolean;
  groupType: ChoreographyGroupType;
  categoryId: string | null;
  categoryName: string | null;
  dancerEditingEligibility: DancerEditingEligibility;
  experienceLevelId: string | null;
  experienceLevelName: string | null;
  operationalStatus: ChoreographyOperationalStatus;
  scheduleCapacityId: string | null;
  scheduleLabel: string;
  dancers: ChoreographyDancer[];
  professors: ChoreographyProfessor[];
};

export type CoreografiaPeopleEditorLoaderData = {
  availableDancers: ChoreographyDancerOption[];
  availableProfessors: ChoreographyProfessorOption[];
  choreography: ChoreographySummary;
  dancerEditingEligibility: DancerEditingEligibility;
  eventContext: {
    isReadOnly: boolean;
  };
};

type ResolvedDancerResolution = Extract<
  ResolveChoreographyDancersResult,
  { ok: true }
>["resolution"];

type DancerResolutionState = {
  groupType: ChoreographySummary["groupType"];
  categoryId: ChoreographySummary["categoryId"];
  categoryName: ChoreographySummary["categoryName"];
  categoryCalculationMode:
    | ResolvedDancerResolution["categoryCalculationMode"]
    | null;
  categoryAgeBasis: ResolvedDancerResolution["categoryAgeBasis"] | null;
  experienceLevelRequired: boolean;
  experienceLevelOptions: Array<{
    id: string;
    name: string;
  }>;
};

const emptyChoreographyEditFieldErrors: ChoreographyEditFieldErrors = {};

export function CoreografiaPeopleEditorForm({
  actionData,
  loaderData,
}: {
  actionData: CoreografiaPeopleEditorActionData;
  loaderData: CoreografiaPeopleEditorLoaderData;
}) {
  const experienceLevelFieldId = useId();
  const scheduleFieldId = useId();
  const resolutionFetcher = useFetcher<DancerResolutionActionData>();
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
    defaultValues: {
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
    },
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
    useState(persistedResolution);
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
  const canSubmit =
    (hasRosterChanged || hasProfessorsChanged) &&
    !isResolving &&
    !isSubmitting &&
    (!hasRosterChanged ||
      (canEditDancers &&
        watchedDancerIds.length > 0 &&
        dancerSelectionKey === resolvedSelectionKey &&
        resolution?.ok === true &&
        scheduleResolution?.status !== "none" &&
        (scheduleResolution?.status !== "multiple" ||
          watchedScheduleCapacityId.length > 0) &&
        (!derivedResolution.experienceLevelRequired ||
          watchedExperienceLevelId.length > 0))) &&
    (!hasProfessorsChanged || canEditProfessors);

  useEffect(() => {
    form.reset({
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
    });
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

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
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

  return (
    <Form method="post" onSubmit={handleSubmit}>
      <Card>
        <CardContent className="flex flex-col gap-5">
          <input type="hidden" name="intent" value={updateChoreographyIntent} />

          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <ReadonlyDetailField
              className="md:col-span-2"
              label="Nombre"
              value={choreography.name}
            />
            <ReadonlyDetailField
              label="Modalidad"
              value={choreography.modalityName}
            />
            <ReadonlyDetailField
              label="Submodalidad"
              value={choreography.submodalityName ?? ""}
            />
            <ReadonlyDetailField
              label="Categoría"
              value={derivedResolution.categoryName ?? "Sin asignar"}
            />
            <ReadonlyDetailField
              label="Tipo de grupo"
              value={formatGroupTypeLabel(derivedResolution.groupType)}
            />
            {hasResolvedRosterChange &&
            derivedResolution.experienceLevelRequired ? (
              <ChoreographySelectPreviewField
                control={form.control}
                fieldName="experienceLevelId"
                id={experienceLevelFieldId}
                label="Nivel de experiencia"
                options={derivedResolution.experienceLevelOptions.map(
                  (option) => ({
                    value: option.id,
                    label: option.name,
                  }),
                )}
              />
            ) : (
              <ReadonlyDetailField
                label="Nivel de experiencia"
                value={
                  hasResolvedRosterChange
                    ? ""
                    : (choreography.experienceLevelName ?? "")
                }
              />
            )}
            {hasResolvedRosterChange &&
            scheduleResolution?.status === "multiple" ? (
              <ChoreographySelectPreviewField
                control={form.control}
                fieldName="scheduleCapacityId"
                id={scheduleFieldId}
                label="Cupo de cronograma"
                options={scheduleOptions.map((option) => ({
                  value: option.id,
                  label: formatScheduleOptionDateTime(option),
                }))}
              />
            ) : (
              <ReadonlyDetailField
                label="Cupo de cronograma"
                value={
                  hasResolvedRosterChange &&
                  scheduleResolution?.status === "auto"
                    ? formatScheduleOptionDateTime(
                        scheduleResolution.options[0],
                      )
                    : choreography.scheduleLabel
                }
              />
            )}
          </FieldGroup>

          <FieldGroup>
            <MultiComboboxField
              control={form.control}
              disabled={!canEditDancers}
              emptyMessage="Sin bailarines disponibles"
              inputName="dancerIds"
              label="Bailarines"
              name="dancerIds"
              options={dancerOptions}
              placeholder="Buscar bailarines"
              searchable={true}
            />
            {!canEditDancers ? (
              <FieldDescription>
                {loaderData.dancerEditingEligibility.reasonText}
              </FieldDescription>
            ) : null}

            <MultiComboboxField
              control={form.control}
              disabled={!canEditProfessors}
              emptyMessage="Sin profesores disponibles"
              inputName="professorIds"
              label="Profesores"
              name="professorIds"
              options={professorOptions}
              placeholder="Buscar profesores"
              searchable={true}
            />
            {!canEditProfessors ? (
              <FieldDescription>
                No podés editar profesores porque la coreografía ya tiene una
                presentación asociada.
              </FieldDescription>
            ) : null}
            {actionData?.status === "update-error" ? (
              <FieldError>{actionData.message}</FieldError>
            ) : null}
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
          <Button asChild variant="outline" size="lg">
            <Link to="/portal/coreografias">Volver</Link>
          </Button>
          <Button type="submit" size="lg" disabled={!canSubmit}>
            {isResolving || isSubmitting ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <Check aria-hidden="true" data-icon="inline-start" />
            )}
            Guardar coreografía
          </Button>
        </CardFooter>
      </Card>
    </Form>
  );
}

function ReadonlyDetailField({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  const id = useId();

  return (
    <Field className={className} data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        <div className="relative">
          <Input id={id} value={value} disabled readOnly className="pr-9" />
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </FieldContent>
    </Field>
  );
}

function ChoreographySelectPreviewField({
  control,
  fieldName,
  id,
  label,
  options,
}: {
  control: Control<ChoreographyEditValues>;
  fieldName: "experienceLevelId" | "scheduleCapacityId";
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Controller
      control={control}
      name={fieldName}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldContent>
            <Select
              name={field.name}
              value={field.value ?? ""}
              onValueChange={field.onChange}
            >
              <SelectTrigger
                id={id}
                aria-invalid={fieldState.error ? true : undefined}
                className="w-full"
              >
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function getSelectableScheduleOptions(
  scheduleResolution:
    | Extract<
        ResolveChoreographyDancersResult,
        { ok: true }
      >["resolution"]["schedule"]
    | null,
) {
  if (!scheduleResolution || scheduleResolution.status === "none") {
    return [];
  }

  return scheduleResolution.options;
}

function formatPersonName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`;
}

function formatScheduleOptionDateTime(option: {
  schedule: {
    name: string;
    scheduledDate?: string;
    startTime?: string;
  };
}) {
  const { scheduledDate, startTime } = option.schedule;

  if (!scheduledDate || !startTime) {
    return option.schedule.name;
  }

  const [year, month, day] = scheduledDate.split("-").map(Number);

  if (!year || !month || !day) {
    return option.schedule.name;
  }

  const date = new Date(year, month - 1, day);
  const formattedDate = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

  return `${formattedDate} - ${startTime.slice(0, 5)} hs.`;
}

function getSelectionKey(ids: string[]) {
  return [...ids].sort().join("|");
}

function getPersistedDancerResolutionState(
  choreography: ChoreographySummary,
): DancerResolutionState {
  return {
    groupType: choreography.groupType,
    categoryId: choreography.categoryId,
    categoryName: choreography.categoryName,
    categoryCalculationMode: null,
    categoryAgeBasis: null,
    experienceLevelRequired:
      choreography.experienceLevelId !== null ||
      choreography.operationalStatus.pendingItems.includes("experienceLevel"),
    experienceLevelOptions:
      choreography.experienceLevelId && choreography.experienceLevelName
        ? [
            {
              id: choreography.experienceLevelId,
              name: choreography.experienceLevelName,
            },
          ]
        : [],
  };
}

function mapResolvedDancerResolutionState(
  result: Extract<ResolveChoreographyDancersResult, { ok: true }>,
): DancerResolutionState {
  return {
    groupType: result.resolution.groupType,
    categoryId: result.resolution.categoryId,
    categoryName: result.resolution.categoryName,
    categoryCalculationMode: result.resolution.categoryCalculationMode ?? null,
    categoryAgeBasis: result.resolution.categoryAgeBasis ?? null,
    experienceLevelRequired: result.resolution.experienceLevel.required,
    experienceLevelOptions: result.resolution.experienceLevel.options,
  };
}

function buildResolveChoreographyDancersFormData(dancerIds: string[]) {
  const UrlSearchParamsCtor =
    typeof window !== "undefined" ? window.URLSearchParams : URLSearchParams;
  const searchParams = new UrlSearchParamsCtor();
  searchParams.set("intent", resolveChoreographyDancersIntent);

  for (const dancerId of dancerIds) {
    searchParams.append("dancerIds", dancerId);
  }

  return searchParams;
}

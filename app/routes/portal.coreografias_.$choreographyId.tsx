import { Check, LoaderCircle, Lock, Trash2, TriangleAlert } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type SubmitEvent,
} from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  redirect,
  useActionData,
  useFetcher,
  useNavigation,
  Link,
} from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import type { PortalRouteHandle } from "@/components/portal/ui";
import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldGroup,
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
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  deleteChoreography,
  findChoreographyForAcademyEvent,
  getChoreographyDeletionAvailability,
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
  resolveChoreographyDancers,
  type ResolveChoreographyDancersResult,
  updateChoreography,
} from "@/lib/portal/choreographies.server";
import {
  formatGroupTypeLabel,
  formatOperationalPendingItemLabel,
} from "@/lib/portal/choreographies";
import { getPortalActiveEventContext } from "@/lib/portal/event-context.server";
import {
  isRouteFormPending,
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import { cn } from "@/lib/shared/utils";

const choreographyNotFoundMessage = "No encontramos esa Coreografía.";
const choreographyDeletedSearchParam = "eliminada";
const routeNotificationSearchParam = "notificacion";
const choreographySavedNotification = "coreografia-guardada";
const choreographyResolutionErrorToastId = "coreografia-resolution-error";
const resolveChoreographyDancersIntent = "resolve-choreography-dancers";
const updateChoreographyIntent = "update-choreography";
const deleteChoreographyIntent = "delete-choreography";
const readOnlyEventMessage = "Este Evento es de solo lectura.";
const unsupportedActionMessage = "Acción no soportada.";
const rosterEditorReviewMessage = "Revisá los bailarines de la coreografía.";

const choreographyEditSchema = z.object({
  dancerIds: z.array(z.string().trim().min(1)).min(1, requiredFieldMessage),
  professorIds: z.array(z.string().trim().min(1)),
  experienceLevelId: z.string().trim().optional(),
  scheduleCapacityId: z.string().trim().optional(),
});

type ChoreographyEditValues = z.infer<typeof choreographyEditSchema>;
type ChoreographyEditFieldErrors = {
  dancerIds?: string;
  experienceLevelId?: string;
  scheduleCapacityId?: string;
};
const emptyChoreographyEditFieldErrors: ChoreographyEditFieldErrors = {};

type DancerResolutionActionData = {
  intent: typeof resolveChoreographyDancersIntent;
  result: ResolveChoreographyDancersResult;
};

type ActionData =
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

type PortalCoreografiaDetalleRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
  actionData?: ActionData;
  initialDancerResolution?: ResolveChoreographyDancersResult;
  initialDeleteDialogOpen?: boolean;
};

type LoaderData = PortalCoreografiaDetalleRouteProps["loaderData"];
type ChoreographyOperationalStatus =
  LoaderData["choreography"]["operationalStatus"];
type ResolvedDancerResolution = Extract<
  ResolveChoreographyDancersResult,
  { ok: true }
>["resolution"];
type DancerResolutionState = {
  groupType: LoaderData["choreography"]["groupType"];
  categoryId: LoaderData["choreography"]["categoryId"];
  categoryName: LoaderData["choreography"]["categoryName"];
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

export const meta = () => [
  { title: "Detalle de Coreografía | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Coreografías", to: "/portal/coreografias" },
    (match) => {
      const data = match.data as LoaderData | undefined;

      return data?.choreography ? { label: data.choreography.name } : null;
    },
  ],
} satisfies PortalRouteHandle;

export function shouldRevalidate({
  defaultShouldRevalidate,
  formData,
}: {
  defaultShouldRevalidate: boolean;
  formData?: FormData;
}) {
  if (formData?.get("intent") === resolveChoreographyDancersIntent) {
    return false;
  }

  return defaultShouldRevalidate;
}

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { choreographyId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const choreographyId = params.choreographyId;

  if (!choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const eventContext = await getPortalActiveEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id;

  if (!selectedEventId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const choreography = await findChoreographyForAcademyEvent(
    academy.id,
    selectedEventId,
    choreographyId,
    {
      isRegistrationOpen: eventContext.isRegistrationOpen,
    },
  );

  if (!choreography) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const availableProfessors = await listProfessorOptionsForChoreography(
    academy.id,
    choreography.professors.map((professor) => professor.id),
  );
  const availableDancers = await listDancerOptionsForChoreography(
    academy.id,
    choreography.dancers.map((dancer) => dancer.id),
  );

  return {
    choreography,
    dancerEditingEligibility: choreography.dancerEditingEligibility,
    availableDancers,
    availableProfessors,
    deletionAvailability: getChoreographyDeletionAvailability({
      isReadOnly: eventContext.isReadOnly,
      isRegistrationOpen: eventContext.isRegistrationOpen,
    }),
    eventContext,
    successMessage: null,
  };
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { choreographyId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const choreographyId = readChoreographyId(params);
  const eventContext = await getPortalActiveEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id;

  if (!selectedEventId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  if (eventContext.isReadOnly) {
    throw new Response(readOnlyEventMessage, { status: 403 });
  }

  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === resolveChoreographyDancersIntent) {
    return {
      intent,
      result: await resolveChoreographyDancers({
        academyId: academy.id,
        choreographyId,
        dancerIds: readFormStringArray(formData, "dancerIds"),
        eventId: selectedEventId,
        isRegistrationOpen: eventContext.isRegistrationOpen,
      }),
    } satisfies DancerResolutionActionData;
  }

  if (intent === updateChoreographyIntent) {
    const dancerIds = readFormStringArray(formData, "dancerIds");
    const professorIds = readFormStringArray(formData, "professorIds");
    return await handleUpdateChoreographyAction({
      academyId: academy.id,
      choreographyId,
      dancerIds,
      eventId: selectedEventId,
      experienceLevelId: readOptionalFormString(formData, "experienceLevelId"),
      isRegistrationOpen: eventContext.isRegistrationOpen,
      professorIds,
      scheduleCapacityId: readOptionalFormString(
        formData,
        "scheduleCapacityId",
      ),
    });
  }

  if (intent === deleteChoreographyIntent) {
    assertDeleteConfirmationMatches(formData, choreographyId);

    return await handleDeleteChoreographyAction({
      academyId: academy.id,
      eventId: selectedEventId,
      choreographyId,
    });
  }

  throw new Response(unsupportedActionMessage, { status: 400 });
}

export function PortalCoreografiaDetalleRouteView({
  loaderData,
  actionData,
  initialDeleteDialogOpen = false,
}: PortalCoreografiaDetalleRouteProps) {
  const canDeleteChoreography = loaderData.deletionAvailability.canDelete;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );

  return (
    <>
      <section
        className="flex flex-col gap-6"
        aria-labelledby="coreografia-title"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 id="coreografia-title" className="text-xl font-semibold">
              Editar coreografía
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Actualizá bailarines y profesores de esta coreografía.
            </p>
          </div>
          {canDeleteChoreography ? (
            <ResourceActionsMenu contentClassName="w-48">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(event) => {
                    event.preventDefault();
                    setIsDeleteDialogOpen(true);
                  }}
                >
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </ResourceActionsMenu>
          ) : null}
        </div>

        <OperationalStatusSummary
          operationalStatus={loaderData.choreography.operationalStatus}
        />

        <ChoreographyEditForm actionData={actionData} loaderData={loaderData} />

        {canDeleteChoreography ? (
          <DeleteChoreographyDialog
            choreographyId={loaderData.choreography.id}
            isOpen={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            warningMessage={loaderData.deletionAvailability.warningMessage}
          />
        ) : null}
      </section>
    </>
  );
}

export default function PortalCoreografiaDetalleRoute({
  loaderData,
}: PortalCoreografiaDetalleRouteProps) {
  const actionData = getUpdateActionData(useActionData<typeof action>());

  return (
    <PortalCoreografiaDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

function getUpdateActionData(
  actionData: ActionData | DancerResolutionActionData,
): ActionData {
  if (!actionData || !("status" in actionData)) {
    return undefined;
  }

  return actionData.status === "update-error" ? actionData : undefined;
}

function ChoreographyEditForm({
  actionData,
  loaderData,
}: {
  actionData: ActionData;
  loaderData: LoaderData;
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
        choreography.scheduleCapacityId,
    },
  });
  const persistedSelectionKey = useMemo(
    () => getDancerSelectionKey(initialDancerIds),
    [initialDancerIds],
  );
  const persistedProfessorSelectionKey = useMemo(
    () => getDancerSelectionKey(initialProfessorIds),
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
    () => getDancerSelectionKey(watchedDancerIds),
    [watchedDancerIds],
  );
  const professorSelectionKey = useMemo(
    () => getDancerSelectionKey(watchedProfessorIds),
    [watchedProfessorIds],
  );
  const hasRosterChanged = dancerSelectionKey !== persistedSelectionKey;
  const hasProfessorsChanged =
    professorSelectionKey !== persistedProfessorSelectionKey;
  const canEditDancers = loaderData.dancerEditingEligibility.canEdit;
  const canEditProfessors =
    !loaderData.eventContext.isReadOnly && !choreography.hasPresentation;
  const isResolving = resolutionFetcher.state !== "idle";
  const isSubmitting = isRouteFormPending(navigation, {
    intent: updateChoreographyIntent,
  });
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
        label: formatDancerName(dancer),
      })),
    [loaderData.availableDancers],
  );
  const professorOptions = useMemo(
    () =>
      loaderData.availableProfessors.map((professor) => ({
        value: professor.id,
        label: formatProfessorName(professor),
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
        choreography.scheduleCapacityId,
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
      form.setValue("scheduleCapacityId", choreography.scheduleCapacityId, {
        shouldDirty: false,
      });
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
            {getChoreographyEditSubmitLabel({ isResolving, isSubmitting })}
          </Button>
        </CardFooter>
      </Card>
    </Form>
  );
}

function getChoreographyEditSubmitLabel(input: {
  isResolving: boolean;
  isSubmitting: boolean;
}) {
  if (input.isSubmitting) {
    return "Guardando coreografía...";
  }

  if (input.isResolving) {
    return "Calculando cambios...";
  }

  return "Guardar coreografía";
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
  control: ReturnType<typeof useForm<ChoreographyEditValues>>["control"];
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

function OperationalStatusSummary({
  operationalStatus,
}: {
  operationalStatus: ChoreographyOperationalStatus;
}) {
  const academyPendingItems = operationalStatus.pendingItems.filter(
    (pendingItem) => pendingItem !== "category",
  );

  if (academyPendingItems.length === 0) {
    return null;
  }

  return (
    <Alert>
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>
        {academyPendingItems.length === 1 ? "Falta" : "Faltan"} cargar{" "}
        {formatAcademyPendingItems(academyPendingItems)}.
      </AlertDescription>
    </Alert>
  );
}

function formatAcademyPendingItems(
  pendingItems: ChoreographyOperationalStatus["pendingItems"],
) {
  return formatList(
    pendingItems.map((pendingItem) => {
      if (pendingItem === "music") {
        return "archivo de música";
      }

      return formatOperationalPendingItemLabel(pendingItem).toLowerCase();
    }),
  );
}

function formatList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

function DeleteChoreographyDialog({
  choreographyId,
  isOpen,
  onOpenChange,
  warningMessage,
}: {
  choreographyId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  warningMessage: string | null;
}) {
  return (
    <>
      {isOpen ? (
        <div className="sr-only">
          <p>¿Eliminar Coreografía?</p>
          <p>
            En esta versión la eliminación es definitiva y libera el cupo del
            Cupo de cronograma.
          </p>
          {warningMessage ? <p>{warningMessage}</p> : null}
          <input type="hidden" name="intent" value={deleteChoreographyIntent} />
        </div>
      ) : null}
      <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
        {isOpen ? (
          <AlertDialogContent
            forceMount
            className="w-[calc(100%-2rem)] max-w-lg gap-4 p-6 sm:max-w-lg"
          >
            <AlertDialogHeader className="flex flex-col items-start gap-1.5 text-left">
              <AlertDialogTitle>¿Eliminar Coreografía?</AlertDialogTitle>
              <AlertDialogDescription>
                En esta versión la eliminación es definitiva y libera el cupo
                del Cupo de cronograma.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {warningMessage ? (
              <p className="rounded-lg bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground">
                {warningMessage}
              </p>
            ) : null}
            <AlertDialogFooter className="m-0 rounded-none border-0 bg-transparent p-0">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value={deleteChoreographyIntent}
                />
                <input
                  type="hidden"
                  name="confirmDeletion"
                  value={choreographyId}
                />
                <Button type="submit" variant="destructive">
                  <Trash2 aria-hidden="true" data-icon="inline-start" />
                  Eliminar Coreografía
                </Button>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </>
  );
}

function formatDancerName(dancer: { firstName: string; lastName: string }) {
  return `${dancer.firstName} ${dancer.lastName}`;
}

function formatProfessorName(professor: {
  firstName: string;
  lastName: string;
}) {
  return `${professor.firstName} ${professor.lastName}`;
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

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  return params.choreographyId;
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readFormStringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" && value ? [value] : []));
}

function readOptionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" && value.length > 0 ? value : null;
}

function getDancerSelectionKey(dancerIds: string[]) {
  return [...dancerIds].sort().join("|");
}

function getPersistedDancerResolutionState(
  choreography: LoaderData["choreography"],
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

function getDancerChangeExplanations(input: {
  currentResolution: DancerResolutionState;
  nextResolution: DancerResolutionState;
}) {
  const explanations: string[] = [];

  if (input.currentResolution.groupType !== input.nextResolution.groupType) {
    explanations.push(
      "El tipo de grupo cambió porque depende de la cantidad de bailarines seleccionados.",
    );
  }

  if (input.currentResolution.categoryId !== input.nextResolution.categoryId) {
    explanations.push(
      getCategoryChangeExplanation(
        input.nextResolution.categoryCalculationMode,
        input.nextResolution.categoryAgeBasis,
      ),
    );
  }

  return explanations;
}

function getCategoryChangeExplanation(
  categoryCalculationMode: DancerResolutionState["categoryCalculationMode"],
  categoryAgeBasis: DancerResolutionState["categoryAgeBasis"],
) {
  if (categoryCalculationMode === "group_tolerance") {
    return "La categoría cambió según la tolerancia de edades permitida para el grupo.";
  }

  if (categoryCalculationMode === "group_average") {
    if (typeof categoryAgeBasis === "number") {
      return `La categoría cambió según la edad promedio del grupo: ${categoryAgeBasis} años.`;
    }

    return "La categoría cambió según la edad promedio del grupo.";
  }

  if (typeof categoryAgeBasis === "number") {
    return `La categoría cambió según la mayor edad del grupo: ${categoryAgeBasis} años.`;
  }

  return "La categoría cambió según el criterio de edad aplicable al grupo.";
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

async function handleUpdateChoreographyAction(input: {
  academyId: string;
  choreographyId: string;
  dancerIds: string[];
  eventId: string;
  experienceLevelId: string | null;
  isRegistrationOpen: boolean;
  professorIds: string[];
  scheduleCapacityId: string | null;
}) {
  const parsed = choreographyEditSchema.safeParse({
    dancerIds: input.dancerIds,
    professorIds: input.professorIds,
    scheduleCapacityId: input.scheduleCapacityId ?? "",
  });

  if (!parsed.success) {
    return {
      status: "update-error" as const,
      section: "dancers" as const,
      fieldErrors: {
        dancerIds:
          parsed.error.flatten().fieldErrors.dancerIds?.[0] ?? undefined,
        scheduleCapacityId:
          parsed.error.flatten().fieldErrors.scheduleCapacityId?.[0] ??
          undefined,
      },
      message: rosterEditorReviewMessage,
      selectedDancerIds: input.dancerIds,
      selectedProfessorIds: input.professorIds,
      selectedExperienceLevelId: input.experienceLevelId,
      selectedScheduleCapacityId: input.scheduleCapacityId ?? undefined,
    };
  }

  const result = await updateChoreography({
    academyId: input.academyId,
    choreographyId: input.choreographyId,
    dancerIds: parsed.data.dancerIds,
    eventId: input.eventId,
    experienceLevelId: input.experienceLevelId,
    isRegistrationOpen: input.isRegistrationOpen,
    professorIds: input.professorIds,
    scheduleCapacityId: parsed.data.scheduleCapacityId,
  });

  if (!result.ok) {
    return {
      status: "update-error" as const,
      section: result.section,
      fieldErrors: result.fieldErrors,
      message: result.message,
      selectedDancerIds: parsed.data.dancerIds,
      selectedProfessorIds: input.professorIds,
      selectedExperienceLevelId: input.experienceLevelId,
      selectedScheduleCapacityId: parsed.data.scheduleCapacityId,
    };
  }

  return redirect(
    `/portal/coreografias/${input.choreographyId}?${routeNotificationSearchParam}=${choreographySavedNotification}`,
  );
}

async function handleDeleteChoreographyAction(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
}) {
  await deleteChoreography({
    academyId: input.academyId,
    eventId: input.eventId,
    choreographyId: input.choreographyId,
  });

  return redirect(`/portal/coreografias?${choreographyDeletedSearchParam}=1`);
}

function assertDeleteConfirmationMatches(
  formData: FormData,
  choreographyId: string,
) {
  if (formData.get("confirmDeletion") !== choreographyId) {
    throw new Response(unsupportedActionMessage, { status: 400 });
  }
}

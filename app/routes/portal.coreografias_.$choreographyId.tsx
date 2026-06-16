import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  redirect,
  useActionData,
  useFetcher,
  useSearchParams,
} from "react-router";
import { clsx } from "clsx";
import { z } from "zod";

import { AccessNotice } from "@/components/auth/access-ui";
import type { PortalRouteHandle } from "@/components/portal/ui";
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
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
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
  updateChoreographyDancers,
  updateChoreographyProfessors,
} from "@/lib/portal/choreographies.server";
import {
  formatGroupTypeLabel,
  formatOperationalPendingItemLabel,
  formatOperationalStatusLabel,
} from "@/lib/portal/choreographies";
import { getPortalEventContext } from "@/lib/portal/event-context.server";
import { getPortalEventStatusLabel } from "@/lib/portal/route-state";
import {
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";

const choreographyNotFoundMessage = "No encontramos esa Coreografía.";
const choreographyProfessorsUpdatedSearchParam = "actualizado";
const choreographyProfessorsUpdatedSuccessMessage =
  "Profesores actualizados correctamente.";
const choreographyDancersUpdatedSearchParam = "bailarines-actualizados";
const choreographyDancersUpdatedSuccessMessage =
  "Bailarines actualizados correctamente.";
const choreographyDeletedSearchParam = "eliminada";
const resolveChoreographyDancersIntent = "resolve-choreography-dancers";
const updateChoreographyDancersIntent = "update-choreography-dancers";
const updateChoreographyProfessorsIntent = "update-choreography-professors";
const deleteChoreographyIntent = "delete-choreography";
const readOnlyEventMessage = "Este Evento es de solo lectura.";
const unsupportedActionMessage = "Acción no soportada.";
const rosterEditorReviewMessage = "Revisá los bailarines de la coreografía.";

const dancerEditorSchema = z.object({
  dancerIds: z.array(z.string().trim().min(1)).min(1, requiredFieldMessage),
  scheduleEntryId: z.string().trim().optional(),
});

type DancerEditorValues = z.infer<typeof dancerEditorSchema>;
type DancerEditorFieldErrors = {
  dancerIds?: string;
  scheduleEntryId?: string;
};
const emptyDancerEditorFieldErrors: DancerEditorFieldErrors = {};

type ResolveDancersActionData = {
  intent: typeof resolveChoreographyDancersIntent;
  result: Awaited<ReturnType<typeof resolveChoreographyDancers>>;
};

type ActionData =
  | {
      status: "dancer-error";
      fieldErrors?: DancerEditorFieldErrors;
      message: string;
      selectedDancerIds: string[];
      selectedScheduleEntryId?: string;
    }
  | {
      status: "professor-error";
      message: string;
      selectedProfessorIds: string[];
    }
  | undefined;

type PortalCoreografiaDetalleRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
  actionData?: ActionData;
  initialDancerResolution?: ResolveDancersActionData["result"];
  initialDeleteDialogOpen?: boolean;
};

type LoaderData = PortalCoreografiaDetalleRouteProps["loaderData"];
type ChoreographyDancerOption = LoaderData["availableDancers"][number];
type ChoreographyProfessor = LoaderData["choreography"]["professors"][number];
type ChoreographyProfessorOption = LoaderData["availableProfessors"][number];
type ChoreographyOperationalStatus =
  LoaderData["choreography"]["operationalStatus"];

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

  const eventContext = await getPortalEventContext(request);
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
    successMessage: readUpdatedSuccessMessage(
      new URL(request.url).searchParams,
    ),
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
  const eventContext = await getPortalEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id;

  if (!selectedEventId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  if (eventContext.isReadOnly) {
    throw new Response(readOnlyEventMessage, { status: 403 });
  }

  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === updateChoreographyProfessorsIntent) {
    const professorIds = readFormStringArray(formData, "professorIds");
    return await handleUpdateChoreographyProfessorsAction({
      academyId: academy.id,
      eventId: selectedEventId,
      choreographyId,
      professorIds,
    });
  }

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
    } satisfies ResolveDancersActionData;
  }

  if (intent === updateChoreographyDancersIntent) {
    const dancerIds = readFormStringArray(formData, "dancerIds");
    return await handleUpdateChoreographyDancersAction({
      academyId: academy.id,
      choreographyId,
      dancerIds,
      eventId: selectedEventId,
      isRegistrationOpen: eventContext.isRegistrationOpen,
      scheduleEntryId: readOptionalFormString(formData, "scheduleEntryId"),
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
  initialDancerResolution,
  initialDeleteDialogOpen = false,
}: PortalCoreografiaDetalleRouteProps) {
  const selectedEvent = loaderData.eventContext.selectedEvent;
  const canEditProfessors = !loaderData.eventContext.isReadOnly;
  const canDeleteChoreography = loaderData.deletionAvailability.canDelete;
  const dancerEditingAvailability = loaderData.dancerEditingEligibility;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );
  const selectedProfessorIds =
    actionData?.status === "professor-error"
      ? new Set(actionData.selectedProfessorIds)
      : new Set(
          loaderData.choreography.professors.map((professor) => professor.id),
        );

  return (
    <>
      <section className="mt-8 space-y-6" aria-labelledby="coreografia-title">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2
              id="coreografia-title"
              className="text-xl font-semibold text-slate-950"
            >
              {loaderData.choreography.name}
            </h2>
            <span
              className={getReadOnlyBadgeClassName(
                loaderData.eventContext.isReadOnly,
              )}
            >
              {getPortalEventStatusLabel(loaderData.eventContext.isReadOnly)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Evento activo: {selectedEvent?.name}
          </p>

          {loaderData.successMessage ? (
            <div className="mt-4">
              <AccessNotice variant="success">
                {loaderData.successMessage}
              </AccessNotice>
            </div>
          ) : null}

          {actionData?.message ? (
            <div className="mt-4">
              <AccessNotice variant="error">{actionData.message}</AccessNotice>
            </div>
          ) : null}

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <DetailItem label="Nombre" value={loaderData.choreography.name} />
            <DetailItem
              label="Modalidad"
              value={[
                loaderData.choreography.modalityName,
                loaderData.choreography.submodalityName,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            <DetailItem
              label="Tipo de grupo"
              value={formatGroupTypeLabel(loaderData.choreography.groupType)}
            />
            <DetailItem
              label="Categoría"
              value={
                loaderData.choreography.categoryName ?? "Categoría pendiente"
              }
            />
            <DetailItem
              label="Nivel de experiencia"
              value={
                loaderData.choreography.experienceLevelName ??
                "No requiere o pendiente"
              }
            />
            <DetailItem
              label="Bloque horario"
              value={loaderData.choreography.scheduleBlockName}
            />
            <DetailItem
              label="Cronograma"
              value={loaderData.choreography.scheduleLabel}
            />
            <DetailItem
              label="Estado operativo"
              value={formatOperationalStatusLabel(
                loaderData.choreography.operationalStatus,
              )}
            />
          </dl>

          <OperationalStatusSummary
            operationalStatus={loaderData.choreography.operationalStatus}
          />
        </div>

        {canDeleteChoreography ? (
          <DeleteChoreographyDialog
            choreographyId={loaderData.choreography.id}
            isOpen={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            onOpenRequest={() => setIsDeleteDialogOpen(true)}
            warningMessage={loaderData.deletionAvailability.warningMessage}
          />
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  Bailarines
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {getDancerSectionDescription(dancerEditingAvailability)}
                </p>
              </div>
              <span
                className={getDancerSectionBadgeClassName(
                  dancerEditingAvailability.canEdit,
                )}
              >
                {dancerEditingAvailability.canEdit
                  ? "Edición disponible"
                  : "Edición no disponible"}
              </span>
            </div>
            {dancerEditingAvailability.reasonText ? (
              <div className="mt-4">
                <AccessNotice variant="info">
                  {dancerEditingAvailability.reasonText}
                </AccessNotice>
              </div>
            ) : null}
            {dancerEditingAvailability.canEdit ? (
              <DancerEditor
                actionData={
                  actionData?.status === "dancer-error" ? actionData : undefined
                }
                dancers={loaderData.availableDancers}
                initialResolution={initialDancerResolution}
                selectedDancers={loaderData.choreography.dancers}
                selectedScheduleEntryId={
                  loaderData.choreography.scheduleEntryId
                }
              />
            ) : (
              <DancerReadonlyList dancers={loaderData.choreography.dancers} />
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  Profesores
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {getProfessorSectionDescription(canEditProfessors)}
                </p>
              </div>
              <span
                className={getProfessorSectionBadgeClassName(canEditProfessors)}
              >
                {canEditProfessors ? "Editable" : "Solo lectura"}
              </span>
            </div>

            {canEditProfessors ? (
              <ProfessorEditor
                professors={loaderData.availableProfessors}
                selectedProfessorIds={selectedProfessorIds}
              />
            ) : (
              <ProfessorReadonlyList
                professors={loaderData.choreography.professors}
              />
            )}
          </div>
        </div>
      </section>
    </>
  );
}

export default function PortalCoreografiaDetalleRoute({
  loaderData,
}: PortalCoreografiaDetalleRouteProps) {
  const actionData = useActionData() as ActionData;
  const [searchParams] = useSearchParams();

  return (
    <PortalCoreografiaDetalleRouteView
      loaderData={{
        ...loaderData,
        successMessage:
          readUpdatedSuccessMessage(searchParams) ?? loaderData.successMessage,
      }}
      actionData={actionData}
    />
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-950">{value}</dd>
    </div>
  );
}

function DancerEditor({
  actionData,
  dancers,
  initialResolution,
  selectedDancers,
  selectedScheduleEntryId,
}: {
  actionData: Extract<ActionData, { status: "dancer-error" }> | undefined;
  dancers: ChoreographyDancerOption[];
  initialResolution: ResolveDancersActionData["result"] | undefined;
  selectedDancers: LoaderData["choreography"]["dancers"];
  selectedScheduleEntryId: string;
}) {
  const resolutionFetcher = useFetcher<ResolveDancersActionData>();
  const dancerOptions = useMemo(
    () =>
      dancers.map((dancer) => ({
        value: dancer.id,
        label: formatDancerName(dancer),
        description: getDancerAvailabilityCopy(dancer.active),
        active: dancer.active,
      })),
    [dancers],
  );
  const dancerOptionByValue = useMemo(
    () => new Map(dancerOptions.map((option) => [option.value, option])),
    [dancerOptions],
  );
  const selectedDancerIds = useMemo(
    () =>
      actionData?.selectedDancerIds ??
      selectedDancers.map((dancer) => dancer.id),
    [actionData?.selectedDancerIds, selectedDancers],
  );
  const initialDancerIds = useMemo(
    () => selectedDancers.map((dancer) => dancer.id),
    [selectedDancers],
  );
  const form = useForm<DancerEditorValues>({
    resolver: zodResolver(dancerEditorSchema),
    defaultValues: {
      dancerIds: selectedDancerIds,
      scheduleEntryId:
        actionData?.selectedScheduleEntryId ?? selectedScheduleEntryId,
    },
  });
  const fieldErrors = actionData?.fieldErrors ?? emptyDancerEditorFieldErrors;
  const watchedDancerIds = form.watch("dancerIds");
  const watchedScheduleEntryId = form.watch("scheduleEntryId") ?? "";
  const [resolution, setResolution] = useState<
    ResolveDancersActionData["result"] | null
  >(initialResolution ?? null);
  const lastResolvedKeyRef = useRef<string | null>(null);
  const fetchedResolution = resolutionFetcher.data?.intent
    ? resolutionFetcher.data.result
    : null;

  useEffect(() => {
    form.reset({
      dancerIds: selectedDancerIds,
      scheduleEntryId:
        actionData?.selectedScheduleEntryId ?? selectedScheduleEntryId,
    });
  }, [
    actionData?.selectedScheduleEntryId,
    form,
    selectedDancerIds,
    selectedScheduleEntryId,
  ]);

  useApplyServerFieldErrors(form, fieldErrors);

  useEffect(() => {
    if (!fetchedResolution) {
      return;
    }

    setResolution(fetchedResolution);

    if (!fetchedResolution.ok) {
      form.setValue("scheduleEntryId", "", { shouldDirty: true });
      return;
    }

    const nextSchedule = fetchedResolution.resolution.schedule;

    if (
      nextSchedule.status === "keep-current" ||
      nextSchedule.status === "auto"
    ) {
      form.setValue("scheduleEntryId", nextSchedule.selectedScheduleEntryId, {
        shouldDirty: true,
      });
      form.clearErrors("scheduleEntryId");
      return;
    }

    if (nextSchedule.status === "multiple") {
      if (
        !nextSchedule.options.some(
          (option) => option.id === watchedScheduleEntryId,
        )
      ) {
        form.setValue("scheduleEntryId", "", { shouldDirty: true });
      }

      return;
    }

    form.setValue("scheduleEntryId", "", { shouldDirty: true });
  }, [fetchedResolution, form, watchedScheduleEntryId]);

  const dancerSelectionKey = useMemo(
    () => [...watchedDancerIds].sort().join("|"),
    [watchedDancerIds],
  );
  const initialDancerSelectionKey = useMemo(
    () => [...initialDancerIds].sort().join("|"),
    [initialDancerIds],
  );
  const hasRosterChanged = dancerSelectionKey !== initialDancerSelectionKey;
  const shouldShowResolution =
    hasRosterChanged || initialResolution !== undefined;
  const isResolving = resolutionFetcher.state !== "idle" && hasRosterChanged;
  const scheduleResolution = resolution?.ok
    ? resolution.resolution.schedule
    : null;
  const scheduleOptions =
    scheduleResolution &&
    (scheduleResolution.status === "keep-current" ||
      scheduleResolution.status === "auto" ||
      scheduleResolution.status === "multiple")
      ? scheduleResolution.options
      : [];

  useEffect(() => {
    if (!hasRosterChanged) {
      lastResolvedKeyRef.current = null;
      setResolution(initialResolution ?? null);
      form.setValue("scheduleEntryId", selectedScheduleEntryId, {
        shouldDirty: false,
      });
      form.clearErrors("scheduleEntryId");
      return;
    }

    if (
      watchedDancerIds.length === 0 ||
      lastResolvedKeyRef.current === dancerSelectionKey
    ) {
      return;
    }

    lastResolvedKeyRef.current = dancerSelectionKey;
    const formData = new FormData();
    formData.set("intent", resolveChoreographyDancersIntent);

    for (const dancerId of watchedDancerIds) {
      formData.append("dancerIds", dancerId);
    }

    resolutionFetcher.submit(formData, { method: "post" });
  }, [
    dancerSelectionKey,
    form,
    hasRosterChanged,
    initialResolution,
    resolutionFetcher,
    selectedScheduleEntryId,
    watchedDancerIds,
  ]);

  const getDancerLabel = (value: string) =>
    dancerOptionByValue.get(value)?.label ?? value;

  const canSave =
    watchedDancerIds.length > 0 &&
    !isResolving &&
    (!hasRosterChanged ||
      (resolution?.ok === true &&
        resolution.resolution.schedule.status !== "none" &&
        (resolution.resolution.schedule.status !== "multiple" ||
          watchedScheduleEntryId.length > 0)));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    void form.handleSubmit(() => {
      if (hasRosterChanged) {
        if (
          !resolution?.ok ||
          resolution.resolution.schedule.status === "none"
        ) {
          return;
        }

        if (
          resolution.resolution.schedule.status === "multiple" &&
          !form.getValues("scheduleEntryId")
        ) {
          form.setError("scheduleEntryId", {
            message: requiredFieldMessage,
            type: "manual",
          });
          return;
        }
      }

      form.clearErrors("scheduleEntryId");
      event.currentTarget.submit();
    })(event);
  }

  return (
    <form
      method="post"
      className="mt-4 flex flex-col gap-4"
      onSubmit={handleSubmit}
    >
      <input
        type="hidden"
        name="intent"
        value={updateChoreographyDancersIntent}
      />
      <FieldSet>
        <FieldLegend variant="label">Bailarines</FieldLegend>
        <FieldDescription>
          Elegí bailarines activos de tu academia. Los archivados solo pueden
          mantenerse o quitarse mientras ya sigan vinculados.
        </FieldDescription>
        <Controller
          control={form.control}
          name="dancerIds"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.error ? true : undefined}>
              {field.value.map((dancerId) => (
                <input
                  key={dancerId}
                  type="hidden"
                  name="dancerIds"
                  value={dancerId}
                />
              ))}
              <Combobox
                items={dancerOptions.map((option) => option.value)}
                itemToStringValue={getDancerLabel}
                multiple
                value={field.value}
                onValueChange={field.onChange}
              >
                <ComboboxChips
                  aria-invalid={fieldState.error ? true : undefined}
                >
                  <ComboboxValue>
                    {field.value.map((value) => (
                      <ComboboxChip key={value}>
                        {getDancerLabel(value)}
                      </ComboboxChip>
                    ))}
                  </ComboboxValue>
                  <ComboboxChipsInput
                    disabled={dancerOptions.length === 0}
                    onBlur={field.onBlur}
                    placeholder={
                      dancerOptions.length > 0
                        ? "Buscar bailarines"
                        : "Sin bailarines disponibles"
                    }
                  />
                </ComboboxChips>
                <ComboboxContent>
                  <ComboboxEmpty>Sin resultados.</ComboboxEmpty>
                  <ComboboxList>
                    {(value) => {
                      const option = dancerOptionByValue.get(value);

                      return (
                        <ComboboxItem key={value} value={value}>
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span>{option?.label ?? value}</span>
                            <span className="text-xs text-muted-foreground">
                              {option?.description}
                            </span>
                          </span>
                          {option?.active === false ? <ArchivedBadge /> : null}
                        </ComboboxItem>
                      );
                    }}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              <FieldContent>
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      </FieldSet>

      {form.getValues("scheduleEntryId") ? (
        <input
          type="hidden"
          name="scheduleEntryId"
          value={form.getValues("scheduleEntryId")}
        />
      ) : null}

      {isResolving ? (
        <AccessNotice variant="info">
          Resolviendo cronograma compatible para este roster.
        </AccessNotice>
      ) : null}

      {shouldShowResolution && resolution?.ok === false ? (
        <AccessNotice variant="error">{resolution.message}</AccessNotice>
      ) : null}

      {shouldShowResolution ? (
        <DancerScheduleResolutionFields
          control={form.control}
          resolution={scheduleResolution}
          scheduleOptions={scheduleOptions}
        />
      ) : null}

      <Button type="submit" className="w-fit" disabled={!canSave}>
        Guardar bailarines
      </Button>
    </form>
  );
}

function DancerReadonlyList({
  dancers,
}: {
  dancers: LoaderData["choreography"]["dancers"];
}) {
  return (
    <ul className="mt-4 flex flex-col gap-3">
      {dancers.map((dancer) => (
        <li
          key={dancer.id}
          className="flex items-center justify-between gap-4 rounded-md border border-slate-100 px-3 py-2"
        >
          <div>
            <p className="text-sm font-medium text-slate-950">
              {dancer.lastName}, {dancer.firstName}
            </p>
            <p className="text-sm text-slate-600">
              Edad al inicio del Evento: {dancer.ageAtEventStart}
            </p>
          </div>
          {!dancer.active ? <ArchivedBadge /> : null}
        </li>
      ))}
    </ul>
  );
}

function DancerScheduleResolutionFields({
  control,
  resolution,
  scheduleOptions,
}: {
  control: ReturnType<typeof useForm<DancerEditorValues>>["control"];
  resolution:
    | Extract<
        ResolveDancersActionData["result"],
        { ok: true }
      >["resolution"]["schedule"]
    | null;
  scheduleOptions: Array<{
    id: string;
    capacity: number;
    groupTypeKey: string;
    scheduleBlock: {
      name: string;
    };
  }>;
}) {
  if (!resolution) {
    return null;
  }

  if (resolution.status === "none") {
    return <AccessNotice variant="error">{resolution.error}</AccessNotice>;
  }

  if (resolution.status === "keep-current") {
    return (
      <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        El cronograma actual sigue siendo compatible y se conserva.
      </p>
    );
  }

  if (resolution.status === "auto") {
    return (
      <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        El cronograma compatible se selecciona automáticamente.
      </p>
    );
  }

  return (
    <Controller
      control={control}
      name="scheduleEntryId"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLegend variant="label">Cronograma</FieldLegend>
          <FieldDescription>
            Elegí un cronograma compatible antes de guardar los bailarines.
          </FieldDescription>
          <Select value={field.value ?? ""} onValueChange={field.onChange}>
            <SelectTrigger
              aria-invalid={fieldState.error ? true : undefined}
              id="choreography-dancer-schedule"
            >
              <SelectValue placeholder="Seleccionar cronograma" />
            </SelectTrigger>
            <SelectContent>
              {scheduleOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {formatScheduleOptionLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldContent>
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function ProfessorEditor({
  professors,
  selectedProfessorIds,
}: {
  professors: ChoreographyProfessorOption[];
  selectedProfessorIds: Set<string>;
}) {
  const professorOptions = useMemo(
    () =>
      professors.map((professor) => ({
        value: professor.id,
        label: formatProfessorName(professor),
        description: getProfessorAvailabilityCopy(professor.active),
        active: professor.active,
      })),
    [professors],
  );
  const professorOptionByValue = useMemo(
    () => new Map(professorOptions.map((option) => [option.value, option])),
    [professorOptions],
  );
  const [currentProfessorIds, setCurrentProfessorIds] = useState(
    Array.from(selectedProfessorIds),
  );

  const getProfessorLabel = (value: string) =>
    professorOptionByValue.get(value)?.label ?? value;

  return (
    <form method="post" className="mt-4 flex flex-col gap-4">
      <input
        type="hidden"
        name="intent"
        value={updateChoreographyProfessorsIntent}
      />
      {currentProfessorIds.map((professorId) => (
        <input
          key={professorId}
          type="hidden"
          name="professorIds"
          value={professorId}
        />
      ))}
      {professorOptions.length > 0 ? (
        <Combobox
          items={professorOptions.map((option) => option.value)}
          itemToStringValue={getProfessorLabel}
          multiple
          value={currentProfessorIds}
          onValueChange={setCurrentProfessorIds}
        >
          <ComboboxChips>
            <ComboboxValue>
              {currentProfessorIds.map((value) => (
                <ComboboxChip key={value}>
                  {getProfessorLabel(value)}
                </ComboboxChip>
              ))}
            </ComboboxValue>
            <ComboboxChipsInput placeholder="Buscar profesores" />
          </ComboboxChips>
          <ComboboxContent>
            <ComboboxEmpty>Sin resultados.</ComboboxEmpty>
            <ComboboxList>
              {(value) => {
                const option = professorOptionByValue.get(value);

                return (
                  <ComboboxItem key={value} value={value}>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span>{option?.label ?? value}</span>
                      <span className="text-xs text-muted-foreground">
                        {option?.description}
                      </span>
                    </span>
                    {option?.active === false ? <ArchivedBadge /> : null}
                  </ComboboxItem>
                );
              }}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      ) : (
        <p className="text-sm leading-6 text-slate-600">
          No hay Profesores activos o vinculados para editar en esta
          Coreografía.
        </p>
      )}

      <Button type="submit" className="w-fit">
        Guardar Profesores
      </Button>
    </form>
  );
}

function ProfessorReadonlyList({
  professors,
}: {
  professors: ChoreographyProfessor[];
}) {
  if (professors.length === 0) {
    return (
      <p className="mt-4 text-sm leading-6 text-slate-600">
        Esta Coreografía todavía no tiene Profesores vinculados.
      </p>
    );
  }

  return (
    <ul className="mt-4 flex flex-col gap-3">
      {professors.map((professor) => (
        <li
          key={professor.id}
          className="flex items-center justify-between gap-4 rounded-md border border-slate-100 px-3 py-2"
        >
          <p className="text-sm font-medium text-slate-950">
            {professor.lastName}, {professor.firstName}
          </p>
          {!professor.active ? <ArchivedBadge /> : null}
        </li>
      ))}
    </ul>
  );
}

function OperationalStatusSummary({
  operationalStatus,
}: {
  operationalStatus: ChoreographyOperationalStatus;
}) {
  if (operationalStatus.code === "complete") {
    return (
      <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Estado operativo al día.
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Pendientes operativos:{" "}
      {operationalStatus.pendingItems
        .map(formatOperationalPendingItemLabel)
        .join(", ")}
    </div>
  );
}

function ArchivedBadge() {
  return (
    <span className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
      Archivado
    </span>
  );
}

function getDancerSectionDescription(
  dancerEditingEligibility: LoaderData["choreography"]["dancerEditingEligibility"],
) {
  if (dancerEditingEligibility.canEdit) {
    return "Actualizá el roster solo cuando la propuesta siga siendo compatible con el tipo de grupo, la categoría, el nivel y el cronograma actuales.";
  }

  return "Consultá los bailarines actuales de esta coreografía y el motivo principal por el que la edición no está disponible.";
}

function getDancerSectionBadgeClassName(canEdit: boolean) {
  return clsx(
    "inline-flex rounded-md px-2.5 py-1 text-xs font-semibold",
    canEdit ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800",
  );
}

function DeleteChoreographyDialog({
  choreographyId,
  isOpen,
  onOpenChange,
  onOpenRequest,
  warningMessage,
}: {
  choreographyId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenRequest: () => void;
  warningMessage: string | null;
}) {
  return (
    <>
      {isOpen ? (
        <div className="sr-only">
          <p>¿Eliminar Coreografía?</p>
          <p>
            En esta versión la eliminación es definitiva y libera el cupo del
            Cronograma.
          </p>
          {warningMessage ? <p>{warningMessage}</p> : null}
          <input type="hidden" name="intent" value={deleteChoreographyIntent} />
        </div>
      ) : null}
      <div>
        <Button type="button" variant="destructive" onClick={onOpenRequest}>
          <Trash2 aria-hidden="true" data-icon="inline-start" />
          Eliminar Coreografía
        </Button>
      </div>
      <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
        <AlertDialogContent
          forceMount
          className="w-[calc(100%-2rem)] max-w-lg gap-4 p-6 sm:max-w-lg"
        >
          <AlertDialogHeader className="flex flex-col items-start gap-1.5 text-left">
            <AlertDialogTitle>¿Eliminar Coreografía?</AlertDialogTitle>
            <AlertDialogDescription>
              En esta versión la eliminación es definitiva y libera el cupo del
              Cronograma.
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
      </AlertDialog>
      <div className="sr-only">Eliminar Coreografía</div>
    </>
  );
}

function getReadOnlyBadgeClassName(isReadOnly: boolean) {
  return isReadOnly
    ? "inline-flex rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
    : "inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800";
}

function getProfessorSectionBadgeClassName(canEditProfessors: boolean) {
  return clsx(
    "inline-flex rounded-md px-2.5 py-1 text-xs font-semibold",
    canEditProfessors
      ? "bg-emerald-50 text-emerald-800"
      : "bg-slate-100 text-slate-700",
  );
}

function getProfessorSectionDescription(canEditProfessors: boolean) {
  return canEditProfessors
    ? "Actualizá los Profesores operativos aunque la inscripción esté cerrada."
    : "Los Profesores vinculados quedan en solo lectura para este Evento.";
}

function getProfessorAvailabilityCopy(isActive: boolean) {
  return isActive
    ? "Disponible para nuevas asignaciones."
    : "Archivado pero conservado por vínculo existente.";
}

function getDancerAvailabilityCopy(isActive: boolean) {
  return isActive
    ? "Disponible para nuevas asignaciones."
    : "Archivado pero conservado por vínculo existente.";
}

function formatDancerName(dancer: { firstName: string; lastName: string }) {
  return `${dancer.lastName}, ${dancer.firstName}`;
}

function formatProfessorName(professor: {
  firstName: string;
  lastName: string;
}) {
  return `${professor.lastName}, ${professor.firstName}`;
}

function formatScheduleOptionLabel(option: {
  scheduleBlock: {
    name: string;
  };
  groupTypeKey: string;
  capacity: number;
}) {
  return `${option.scheduleBlock.name} · ${formatGroupTypeLabel(option.groupTypeKey as Parameters<typeof formatGroupTypeLabel>[0])} · Cupo ${option.capacity}`;
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

function readOptionalFormString(formData: FormData, key: string) {
  const value = readFormString(formData, key).trim();

  return value.length > 0 ? value : null;
}

function readFormStringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" && value ? [value] : []));
}

async function handleUpdateChoreographyProfessorsAction(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  professorIds: string[];
}) {
  const result = await updateChoreographyProfessors({
    academyId: input.academyId,
    eventId: input.eventId,
    choreographyId: input.choreographyId,
    professorIds: input.professorIds,
  });

  if (!result.ok) {
    return {
      status: "professor-error" as const,
      message: result.message,
      selectedProfessorIds: input.professorIds,
    };
  }

  return redirect(
    `/portal/coreografias/${input.choreographyId}?${choreographyProfessorsUpdatedSearchParam}=1`,
  );
}

async function handleUpdateChoreographyDancersAction(input: {
  academyId: string;
  choreographyId: string;
  dancerIds: string[];
  eventId: string;
  isRegistrationOpen: boolean;
  scheduleEntryId: string | null;
}) {
  const parsed = dancerEditorSchema.safeParse({
    dancerIds: input.dancerIds,
    scheduleEntryId: input.scheduleEntryId ?? "",
  });

  if (!parsed.success) {
    return {
      status: "dancer-error" as const,
      fieldErrors: {
        dancerIds:
          parsed.error.flatten().fieldErrors.dancerIds?.[0] ?? undefined,
      },
      message: rosterEditorReviewMessage,
      selectedDancerIds: input.dancerIds,
      selectedScheduleEntryId: input.scheduleEntryId ?? undefined,
    };
  }

  const result = await updateChoreographyDancers({
    academyId: input.academyId,
    choreographyId: input.choreographyId,
    dancerIds: parsed.data.dancerIds,
    eventId: input.eventId,
    isRegistrationOpen: input.isRegistrationOpen,
    scheduleEntryId: parsed.data.scheduleEntryId,
  });

  if (!result.ok) {
    return {
      status: "dancer-error" as const,
      fieldErrors: result.fieldErrors,
      message: result.message,
      selectedDancerIds: parsed.data.dancerIds,
      selectedScheduleEntryId: parsed.data.scheduleEntryId,
    };
  }

  return redirect(
    `/portal/coreografias/${input.choreographyId}?${choreographyDancersUpdatedSearchParam}=1`,
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

function readUpdatedSuccessMessage(searchParams: URLSearchParams) {
  if (searchParams.get(choreographyDancersUpdatedSearchParam) === "1") {
    return choreographyDancersUpdatedSuccessMessage;
  }

  if (searchParams.get(choreographyProfessorsUpdatedSearchParam) === "1") {
    return choreographyProfessorsUpdatedSuccessMessage;
  }

  return null;
}

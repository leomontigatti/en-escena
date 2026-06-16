import { zodResolver } from "@hookform/resolvers/zod";
import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  Controller,
  useForm,
  type Control,
  type UseFormReturn,
} from "react-hook-form";
import { Link, redirect, useFetcher, useSearchParams } from "react-router";
import { z } from "zod";
import { clsx } from "clsx";

import { AccessNotice } from "@/components/auth/access-ui";
import {
  PortalEmptyList,
  type PortalRouteHandle,
} from "@/components/portal/ui";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  formatGroupTypeLabel as formatChoreographyGroupTypeLabel,
  formatOperationalStatusLabel,
  type ChoreographyListItem,
} from "@/lib/portal/choreographies";
import {
  createChoreographyRegistration,
  type CreateChoreographyRegistrationResult,
} from "@/lib/choreographies/registration-confirmation.server";
import {
  resolveChoreographyRegistrationOperation,
  type ChoreographyRegistrationOperationResult,
} from "@/lib/choreographies/registration-resolution.server";
import { listChoreographiesForAcademyEvent } from "@/lib/portal/choreographies.server";
import { listAcademyProfessors } from "@/lib/portal/professors.server";
import { listDancersForAcademy } from "@/lib/portal/dancers.server";
import { getPortalEventContext } from "@/lib/portal/event-context.server";
import { getPortalEventStatusLabel } from "@/lib/portal/route-state";
import {
  getChoreographyRegistrationBaseOptions,
  getEventBases,
  type ChoreographyRegistrationBaseOptions,
} from "@/lib/events/bases.server";
import { requiredFieldMessage } from "@/lib/shared/forms";

type PortalCoreografiasRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
  created?: boolean;
  deleted?: boolean;
  initialCreateDialogOpen?: boolean;
};

type PortalCoreografiasLoaderData = PortalCoreografiasRouteProps["loaderData"];
type PortalEventContext = PortalCoreografiasLoaderData["eventContext"];
type RegistrationResolution = Extract<
  ChoreographyRegistrationOperationResult,
  { ok: true }
>["resolution"];

type CalculationActionData = {
  intent: "resolve-choreography-registration";
  result: ChoreographyRegistrationOperationResult;
};

type CreateActionData = {
  intent: "create-choreography";
  result: Exclude<CreateChoreographyRegistrationResult, { ok: true }>;
};

const RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT =
  "resolve-choreography-registration";
const CREATE_CHOREOGRAPHY_INTENT = "create-choreography";
const CHOREOGRAPHY_REGISTRATION_STEP_LABELS = [
  "Nombre",
  "Modalidad",
  "Bailarines",
  "Nivel y cronograma",
  "Resumen",
] as const;

const createChoreographySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, requiredFieldMessage)
    .max(
      120,
      "El nombre de la Coreografía no puede superar los 120 caracteres.",
    ),
  modalityId: z.string().trim().min(1, requiredFieldMessage),
  submodalityId: z.string().trim().optional(),
  dancerIds: z.array(z.string()).min(1, requiredFieldMessage),
  professorIds: z.array(z.string()),
  experienceLevelId: z.string().trim().optional(),
  scheduleEntryId: z.string().trim().optional(),
});

type CreateChoreographyFormValues = z.infer<typeof createChoreographySchema>;
type CreateChoreographyForm = UseFormReturn<CreateChoreographyFormValues>;
type ManualRequiredFieldName =
  | "experienceLevelId"
  | "scheduleEntryId"
  | "submodalityId";

const emptyCreateChoreographyValues: CreateChoreographyFormValues = {
  name: "",
  modalityId: "",
  submodalityId: "",
  dancerIds: [],
  professorIds: [],
  experienceLevelId: "",
  scheduleEntryId: "",
};

export const meta = () => [
  { title: "Coreografías | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Coreografías" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id ?? null;
  const [choreographies, activeDancers, activeProfessors, baseOptions] =
    await Promise.all([
      selectedEventId
        ? listChoreographiesForAcademyEvent(academy.id, selectedEventId)
        : Promise.resolve([]),
      listDancersForAcademy(academy.id, { status: "active" }),
      listAcademyProfessors(academy.id, { status: "active" }),
      selectedEventId ? getEventBases(selectedEventId) : Promise.resolve(null),
    ]);

  return {
    choreographies,
    eventContext,
    activeDancers,
    activeProfessors,
    registrationBaseOptions: baseOptions
      ? getChoreographyRegistrationBaseOptions(baseOptions)
      : null,
  };
}

export async function action({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT) {
    return {
      intent,
      result: await resolveChoreographyRegistrationOperation({
        academyId: academy.id,
        eventId: readFormString(formData, "eventId"),
        modalityId: readFormString(formData, "modalityId"),
        submodalityId: readOptionalFormString(formData, "submodalityId"),
        dancerIds: readFormStringArray(formData, "dancerIds"),
      }),
    } satisfies CalculationActionData;
  }

  if (intent === CREATE_CHOREOGRAPHY_INTENT) {
    const result = await createChoreographyRegistration({
      academyId: academy.id,
      eventId: readFormString(formData, "eventId"),
      name: readFormString(formData, "name"),
      modalityId: readFormString(formData, "modalityId"),
      submodalityId: readOptionalFormString(formData, "submodalityId"),
      dancerIds: readFormStringArray(formData, "dancerIds"),
      professorIds: readFormStringArray(formData, "professorIds"),
      experienceLevelId: readOptionalFormString(formData, "experienceLevelId"),
      scheduleEntryId: readFormString(formData, "scheduleEntryId"),
    });

    if (!result.ok) {
      return {
        intent,
        result,
      } satisfies CreateActionData;
    }

    throw redirect("/portal/coreografias?creada=1");
  }

  throw new Response("Acción no soportada.", { status: 400 });
}

export function PortalCoreografiasRouteView({
  loaderData,
  created = false,
  deleted = false,
  initialCreateDialogOpen = false,
}: PortalCoreografiasRouteProps) {
  const selectedEvent = loaderData.eventContext.selectedEvent;
  const eventStatus = getEventStatus(loaderData.eventContext.isReadOnly);
  const creationState = getCreationState(
    loaderData.eventContext,
    loaderData.activeDancers.length,
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(
    initialCreateDialogOpen,
  );

  return (
    <>
      <section className="mt-8" aria-labelledby="coreografias-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p
              id="coreografias-title"
              className="text-sm font-semibold text-slate-950"
            >
              Coreografías
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              La lista se limita al Evento activo y a tu academia.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
          {selectedEvent ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    {selectedEvent.name}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Revisá nombre, modalidad, categoría y estado operativo de
                    cada Coreografía del Evento activo.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:items-end">
                  <span className={eventStatus.className}>
                    {eventStatus.label}
                  </span>
                  <button
                    type="button"
                    disabled={!creationState.canCreate}
                    onClick={() => setIsCreateModalOpen(true)}
                    className={clsx(
                      "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100",
                      creationState.canCreate
                        ? "bg-teal-700 text-white hover:bg-teal-800"
                        : "cursor-not-allowed bg-slate-200 text-slate-500",
                    )}
                  >
                    Crear Coreografía
                  </button>
                </div>
              </div>
              <div
                className={clsx(
                  "mt-4 rounded-lg px-4 py-3 text-sm leading-6",
                  creationToneClassNames[creationState.tone],
                )}
              >
                <p>{creationState.message}</p>
              </div>

              {created ? (
                <div className="mt-4">
                  <AccessNotice variant="success">
                    La Coreografía se registró correctamente.
                  </AccessNotice>
                </div>
              ) : null}

              {deleted ? (
                <div className="mt-4">
                  <AccessNotice variant="success">
                    La Coreografía se eliminó correctamente.
                  </AccessNotice>
                </div>
              ) : null}

              {loaderData.choreographies.length > 0 ? (
                <ChoreographyTable choreographies={loaderData.choreographies} />
              ) : (
                <PortalEmptyList
                  title="No hay coreografías registradas para este evento"
                  description="Cuando registres una Coreografía para el Evento activo, la vas a poder seguir acá junto con su estado operativo."
                />
              )}
            </>
          ) : (
            <PortalEmptyList
              title="Todavía no hay Eventos configurados"
              description="Cuando administración cree un Evento, vas a poder consultar las Coreografías de tu academia desde esta sección."
            />
          )}
        </div>
      </section>

      {isCreateModalOpen &&
      selectedEvent &&
      loaderData.registrationBaseOptions ? (
        <CreateChoreographyModal
          baseOptions={loaderData.registrationBaseOptions}
          dancers={loaderData.activeDancers}
          eventId={selectedEvent.id}
          eventName={selectedEvent.name}
          professors={loaderData.activeProfessors}
          onClose={() => setIsCreateModalOpen(false)}
        />
      ) : null}
    </>
  );
}

export default function PortalCoreografiasRoute({
  loaderData,
}: {
  loaderData: Awaited<ReturnType<typeof loader>>;
}) {
  const [searchParams] = useSearchParams();

  return (
    <PortalCoreografiasRouteView
      created={searchParams.get("creada") === "1"}
      deleted={searchParams.get("eliminada") === "1"}
      loaderData={loaderData}
    />
  );
}

function ChoreographyTable({
  choreographies,
}: {
  choreographies: PortalCoreografiasRouteProps["loaderData"]["choreographies"];
}) {
  const columns: DataTableColumn<ChoreographyListItem>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "font-medium",
      cell: (choreography) => (
        <Link
          to={`/portal/coreografias/${choreography.id}`}
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {choreography.name}
        </Link>
      ),
      filterValue: (choreography) =>
        [
          choreography.name,
          choreography.modalityName,
          choreography.submodalityName,
          choreography.categoryName,
          formatChoreographyGroupTypeLabel(choreography.groupType),
        ]
          .filter(Boolean)
          .join(" "),
      sortValue: (choreography) => choreography.name,
    },
    {
      id: "modality",
      header: "Modalidad / Submodalidad",
      cell: (choreography) =>
        formatPrimaryAndSecondaryValue(
          choreography.modalityName,
          choreography.submodalityName,
        ),
      filterValue: (choreography) =>
        [choreography.modalityName, choreography.submodalityName]
          .filter(Boolean)
          .join(" "),
      sortValue: (choreography) =>
        formatPrimaryAndSecondaryValue(
          choreography.modalityName,
          choreography.submodalityName,
        ),
    },
    {
      id: "categoryGroup",
      header: "Categoría / Tipo de grupo",
      cell: (choreography) =>
        formatPrimaryAndSecondaryValue(
          choreography.categoryName ?? "Categoría pendiente",
          formatChoreographyGroupTypeLabel(choreography.groupType),
        ),
      filterValue: (choreography) =>
        [
          choreography.categoryName ?? "Categoría pendiente",
          formatChoreographyGroupTypeLabel(choreography.groupType),
        ].join(" "),
      sortValue: (choreography) =>
        formatPrimaryAndSecondaryValue(
          choreography.categoryName ?? "Categoría pendiente",
          formatChoreographyGroupTypeLabel(choreography.groupType),
        ),
    },
    {
      id: "status",
      header: "Estado",
      cell: (choreography) => (
        <OperationalStatusBadge choreography={choreography} />
      ),
      filterValues: (choreography) => [choreography.operationalStatus.code],
      sortValue: (choreography) =>
        formatOperationalStatusLabel(choreography.operationalStatus),
    },
  ];

  return (
    <div className="mt-4">
      <DataTable
        rows={choreographies}
        columns={columns}
        getRowKey={(choreography) => choreography.id}
        searchPlaceholder="Buscar coreografía por nombre, modalidad o categoría"
        textFilterColumnId="name"
        facetedFilters={[
          {
            columnId: "status",
            label: "Filtros",
            groups: [
              {
                label: "Estado",
                options: [
                  { label: "Completa", value: "complete" },
                  { label: "Pendiente", value: "incomplete" },
                ],
              },
            ],
          },
        ]}
        emptyMessage="No hay coreografías que coincidan con la búsqueda o los filtros."
        initialSort={{ columnId: "name", direction: "asc" }}
      />
    </div>
  );
}

function OperationalStatusBadge({
  choreography,
}: {
  choreography: ChoreographyListItem;
}) {
  if (choreography.operationalStatus.code === "complete") {
    return <Badge variant="secondary">Completa</Badge>;
  }

  return (
    <Badge variant="outline">
      {formatOperationalStatusLabel(choreography.operationalStatus)}
    </Badge>
  );
}

type CreationState = {
  tone: "ready" | "blocked" | "info";
  message: string;
  canCreate: boolean;
};

const creationToneClassNames: Record<CreationState["tone"], string> = {
  ready: "bg-emerald-50 text-emerald-900",
  blocked: "bg-amber-50 text-amber-900",
  info: "bg-slate-50 text-slate-700",
};

const EVENT_STATUS_BADGE_CLASS_NAME =
  "inline-flex w-fit rounded-md px-2.5 py-1 text-xs font-semibold";

function getCreationState(
  eventContext: PortalEventContext,
  activeDancerCount: number,
): CreationState {
  if (!eventContext.hasActiveEvent) {
    return {
      tone: "blocked",
      message: "Todavía no hay un Evento activo para registrar coreografías.",
      canCreate: false,
    };
  }

  if (eventContext.activeEventRegistrationReadiness?.isReady === false) {
    return {
      tone: "blocked",
      message:
        "El Evento activo todavía no tiene la configuración mínima para registrar coreografías.",
      canCreate: false,
    };
  }

  if (!eventContext.isRegistrationOpen) {
    return {
      tone: "blocked",
      message:
        "La inscripción del Evento activo está cerrada y no admite nuevas coreografías.",
      canCreate: false,
    };
  }

  if (activeDancerCount === 0) {
    return {
      tone: "blocked",
      message:
        "Necesitás al menos un Bailarín activo para registrar una Coreografía.",
      canCreate: false,
    };
  }

  if (eventContext.selectedEvent !== null) {
    return {
      tone: "ready",
      message:
        "La creación de coreografías va a estar disponible para este Evento mientras la inscripción esté abierta.",
      canCreate: true,
    };
  }

  return {
    tone: "info",
    message:
      "La creación de coreografías va a estar disponible cuando exista un Evento activo y la inscripción esté abierta.",
    canCreate: false,
  };
}

function getEventStatus(isReadOnly: boolean) {
  if (isReadOnly) {
    return {
      label: getPortalEventStatusLabel(true),
      className: `${EVENT_STATUS_BADGE_CLASS_NAME} bg-amber-50 text-amber-800`,
    };
  }

  return {
    label: getPortalEventStatusLabel(false),
    className: `${EVENT_STATUS_BADGE_CLASS_NAME} bg-emerald-50 text-emerald-800`,
  };
}

function formatPrimaryAndSecondaryValue(
  primaryValue: string,
  secondaryValue: string | null,
) {
  return secondaryValue ? `${primaryValue} · ${secondaryValue}` : primaryValue;
}

function CreateChoreographyModal({
  baseOptions,
  dancers,
  eventId,
  eventName,
  professors,
  onClose,
}: {
  baseOptions: ChoreographyRegistrationBaseOptions;
  dancers: PortalCoreografiasLoaderData["activeDancers"];
  eventId: string;
  eventName: string;
  professors: PortalCoreografiasLoaderData["activeProfessors"];
  onClose: () => void;
}) {
  const calculationFetcher = useFetcher<typeof action>();
  const submissionFetcher = useFetcher<typeof action>();
  const nameFieldId = useId();
  const modalityFieldId = useId();
  const submodalityFieldId = useId();
  const experienceLevelFieldId = useId();
  const scheduleEntryFieldId = useId();
  const [currentStep, setCurrentStep] = useState(0);
  const [resolution, setResolution] = useState<RegistrationResolution | null>(
    null,
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
  const selectedScheduleEntryId = watchedValues.scheduleEntryId ?? "";

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
  const calculationData = calculationFetcher.data as
    | CalculationActionData
    | undefined;
  const submissionData = submissionFetcher.data as CreateActionData | undefined;
  const canChooseSubmodality = selectedSubmodalities.length > 0;
  const isResolving = calculationFetcher.state !== "idle";
  const isSubmitting = submissionFetcher.state !== "idle";
  const calculationError = getCalculationError(calculationData);
  const submissionError = getSubmissionError(submissionData);
  const isDirty = form.formState.isDirty;

  useEffect(() => {
    if (
      calculationData?.intent !== RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT ||
      !calculationData.result.ok
    ) {
      return;
    }

    const nextResolution = calculationData.result.resolution;
    setResolution(nextResolution);

    if (nextResolution.experienceLevel.required) {
      if (
        !nextResolution.experienceLevel.options.some(
          (option) => option.id === selectedExperienceLevelId,
        )
      ) {
        form.setValue(
          "experienceLevelId",
          nextResolution.experienceLevel.options[0]?.id ?? "",
          { shouldDirty: true },
        );
      }
    } else {
      form.setValue("experienceLevelId", "", { shouldDirty: true });
    }

    if (nextResolution.schedule.status === "auto") {
      form.setValue(
        "scheduleEntryId",
        nextResolution.schedule.scheduleEntryId,
        { shouldDirty: true },
      );
    } else if (
      nextResolution.schedule.status === "multiple" &&
      !nextResolution.schedule.options.some(
        (option) => option.id === selectedScheduleEntryId,
      )
    ) {
      form.setValue("scheduleEntryId", "", { shouldDirty: true });
    }

    setCurrentStep(3);
  }, [
    calculationData,
    form,
    selectedExperienceLevelId,
    selectedScheduleEntryId,
  ]);

  function resetResolutionState() {
    setResolution(null);
    form.setValue("experienceLevelId", "", { shouldDirty: true });
    form.setValue("scheduleEntryId", "", { shouldDirty: true });
    form.clearErrors(["experienceLevelId", "scheduleEntryId"]);
  }

  function handleClose() {
    if (
      isDirty &&
      typeof window !== "undefined" &&
      !window.confirm(
        "Vas a descartar los cambios de esta Coreografía. ¿Querés cerrar igual?",
      )
    ) {
      return;
    }

    onClose();
  }

  async function handleAdvanceFromName() {
    const isValid = await form.trigger("name");

    if (isValid) {
      setCurrentStep(1);
    }
  }

  async function handleAdvanceFromModality() {
    const isValid = await form.trigger("modalityId");

    if (!isValid) {
      return;
    }

    if (canChooseSubmodality && !selectedSubmodalityId) {
      setRequiredFieldError(form, "submodalityId");
      return;
    }

    form.clearErrors("submodalityId");
    setCurrentStep(2);
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

  async function handleAdvanceFromResolution() {
    if (!resolution) {
      return;
    }

    if (resolution.experienceLevel.required && !selectedExperienceLevelId) {
      setRequiredFieldError(form, "experienceLevelId");
      return;
    }

    form.clearErrors("experienceLevelId");

    if (resolution.schedule.status === "multiple" && !selectedScheduleEntryId) {
      setRequiredFieldError(form, "scheduleEntryId");
      return;
    }

    form.clearErrors("scheduleEntryId");
    setCurrentStep(4);
  }

  function handleConfirm() {
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
        scheduleEntryId: selectedScheduleEntryId,
      }),
      { method: "post" },
    );
  }

  const canAdvanceFromName = watchedValues.name.trim().length > 0;
  const canAdvanceFromModality =
    selectedModalityId.length > 0 &&
    (!canChooseSubmodality || selectedSubmodalityId.length > 0);
  const canResolve = selectedDancerIds.length > 0;
  const hasRequiredExperienceLevel =
    resolution !== null &&
    (!resolution.experienceLevel.required ||
      selectedExperienceLevelId.length > 0);
  const hasRequiredSchedule =
    resolution !== null &&
    (resolution.schedule.status === "auto" ||
      (resolution.schedule.status === "multiple" &&
        selectedScheduleEntryId.length > 0));
  const canAdvanceFromResolution =
    resolution !== null && hasRequiredExperienceLevel && hasRequiredSchedule;

  return (
    <Dialog open onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
        overlayClassName="backdrop-blur-sm"
      >
        <DialogHeader>
          <DialogTitle>Registrar Coreografía</DialogTitle>
          <DialogDescription>
            {eventName}. El alta se confirma recién en el último paso.
          </DialogDescription>
        </DialogHeader>

        <ol className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-5">
          {CHOREOGRAPHY_REGISTRATION_STEP_LABELS.map((label, index) => (
            <li
              key={label}
              className={clsx(
                "rounded-md border px-3 py-2",
                currentStep === index
                  ? "border-primary/30 bg-primary/5 text-foreground"
                  : "bg-muted/50",
              )}
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>

        {submissionError ? (
          <div className="mt-4">
            <AccessNotice variant="error">{submissionError}</AccessNotice>
          </div>
        ) : null}

        <div className="flex flex-col gap-6">
          {currentStep === 0 ? (
            <section className="flex flex-col gap-4">
              <ChoreographyTextField
                control={form.control}
                fieldName="name"
                id={nameFieldId}
                label="Nombre"
                placeholder="Ej.: Danza de la luna"
              />
              <FieldDescription>
                El nombre se normaliza al confirmar. Se permiten duplicados.
              </FieldDescription>
            </section>
          ) : null}

          {currentStep === 1 ? (
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

              {canChooseSubmodality ? (
                <ChoreographySelectField
                  control={form.control}
                  fieldName="submodalityId"
                  id={submodalityFieldId}
                  label="Submodalidad"
                  onValueChange={() => {
                    resetResolutionState();
                  }}
                  options={selectedSubmodalities.map((submodality) => ({
                    value: submodality.id,
                    label: submodality.name,
                  }))}
                />
              ) : null}
            </section>
          ) : null}

          {currentStep === 2 ? (
            <section className="flex flex-col gap-6">
              <FieldSet>
                <FieldLegend>Bailarines</FieldLegend>
                <FieldDescription>
                  Elegí uno o más Bailarines activos. No se crean registros en
                  línea desde esta ficha.
                </FieldDescription>
                <FieldGroup>
                  {dancers.map((dancer) => (
                    <SelectionCheckboxField
                      key={dancer.id}
                      control={form.control}
                      fieldName="dancerIds"
                      label={`${dancer.lastName}, ${dancer.firstName}`}
                      onToggle={resetResolutionState}
                      optionId={dancer.id}
                    />
                  ))}
                </FieldGroup>
                <FieldError>
                  {form.formState.errors.dancerIds?.message}
                </FieldError>
              </FieldSet>

              <FieldSet>
                <FieldLegend>Profesores</FieldLegend>
                <FieldDescription>
                  La asignación es opcional y se puede dejar vacía.
                </FieldDescription>
                <FieldGroup>
                  {professors.length > 0 ? (
                    professors.map((professor) => (
                      <SelectionCheckboxField
                        key={professor.id}
                        control={form.control}
                        fieldName="professorIds"
                        label={`${professor.lastName}, ${professor.firstName}`}
                        optionId={professor.id}
                      />
                    ))
                  ) : (
                    <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                      No hay Profesores activos para vincular.
                    </p>
                  )}
                </FieldGroup>
              </FieldSet>

              {calculationError ? (
                <AccessNotice variant="error">{calculationError}</AccessNotice>
              ) : null}
            </section>
          ) : null}

          {currentStep === 3 && resolution ? (
            <section className="space-y-5">
              <SummaryGrid>
                <SummaryItem
                  label="Tipo de grupo"
                  value={resolution.groupType}
                />
                <SummaryItem
                  label="Categoría"
                  value={
                    resolution.category.status === "resolved"
                      ? resolution.category.name
                      : "Pendiente"
                  }
                />
              </SummaryGrid>

              {resolution.experienceLevel.required ? (
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
              ) : (
                <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  Esta selección no requiere Nivel de experiencia.
                </p>
              )}

              {resolution.schedule.status === "none" ? (
                <AccessNotice variant="error">
                  {resolution.schedule.error}
                </AccessNotice>
              ) : resolution.schedule.status === "auto" ? (
                <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  El Cronograma compatible se selecciona automáticamente.
                </p>
              ) : (
                <ChoreographySelectField
                  control={form.control}
                  fieldName="scheduleEntryId"
                  id={scheduleEntryFieldId}
                  label="Cronograma"
                  options={resolution.schedule.options.map((option) => ({
                    value: option.id,
                    label: `${option.scheduleBlock.name} · ${formatGroupTypeLabel(option.groupTypeKey)} · Cupo ${option.capacity}`,
                  }))}
                />
              )}
            </section>
          ) : null}

          {currentStep === 4 && resolution ? (
            <section className="space-y-5">
              <SummaryGrid>
                <SummaryItem
                  label="Nombre"
                  value={watchedValues.name.trim() || "Sin nombre"}
                />
                <SummaryItem
                  label="Modalidad"
                  value={formatModalitySummary(
                    baseOptions,
                    selectedModalityId,
                    selectedSubmodalityId,
                  )}
                />
                <SummaryItem
                  label="Tipo de grupo"
                  value={formatGroupTypeLabel(resolution.groupType)}
                />
                <SummaryItem
                  label="Categoría"
                  value={
                    resolution.category.status === "resolved"
                      ? resolution.category.name
                      : "Pendiente de configuración"
                  }
                />
                <SummaryItem
                  label="Nivel de experiencia"
                  value={
                    resolution.experienceLevel.required
                      ? (resolution.experienceLevel.options.find(
                          (option) => option.id === selectedExperienceLevelId,
                        )?.name ?? "Pendiente")
                      : "No aplica"
                  }
                />
                <SummaryItem
                  label="Cronograma"
                  value={formatScheduleSummary(
                    resolution,
                    selectedScheduleEntryId,
                  )}
                />
              </SummaryGrid>

              <div className="rounded-lg border bg-muted/50 p-4">
                <h3 className="text-sm font-semibold">Bailarines</h3>
                {resolution.groupType === "grupal" ? (
                  <p className="mt-2 text-sm">
                    {resolution.dancers.length} Bailarines seleccionados.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {resolution.dancers.map((dancer) => (
                      <li key={dancer.id}>
                        {dancer.lastName}, {dancer.firstName} · Edad al inicio
                        del Evento: {dancer.ageAtEventStart}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border bg-muted/50 p-4">
                <h3 className="text-sm font-semibold">Profesores</h3>
                {selectedProfessors.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {selectedProfessors.map((professor) => (
                      <li key={professor.id}>
                        {professor.lastName}, {professor.firstName}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm">No se asignaron Profesores.</p>
                )}
              </div>
            </section>
          ) : null}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={
              currentStep === 0
                ? handleClose
                : () => setCurrentStep((step) => step - 1)
            }
          >
            {currentStep === 0 ? "Cancelar" : "Volver"}
          </Button>

          <div className="flex flex-col gap-3 sm:flex-row">
            {currentStep === 0 ? (
              <Button
                type="button"
                disabled={!canAdvanceFromName}
                onClick={() => void handleAdvanceFromName()}
              >
                Continuar
              </Button>
            ) : null}

            {currentStep === 1 ? (
              <Button
                type="button"
                disabled={!canAdvanceFromModality}
                onClick={() => void handleAdvanceFromModality()}
              >
                Continuar
              </Button>
            ) : null}

            {currentStep === 2 ? (
              <Button
                type="button"
                disabled={!canResolve || isResolving}
                onClick={handleResolveStep}
              >
                {isResolving ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin"
                    data-icon
                  />
                ) : null}
                {isResolving ? "Resolviendo..." : "Continuar"}
              </Button>
            ) : null}

            {currentStep === 3 ? (
              <Button
                type="button"
                disabled={!canAdvanceFromResolution}
                onClick={() => void handleAdvanceFromResolution()}
              >
                Continuar
              </Button>
            ) : null}

            {currentStep === 4 ? (
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
                {isSubmitting ? "Confirmando..." : "Confirmar Coreografía"}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm">{value}</p>
    </div>
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
    | "scheduleEntryId";
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
                <SelectContent>
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

function SelectionCheckboxField({
  control,
  fieldName,
  label,
  onToggle,
  optionId,
}: {
  control: Control<CreateChoreographyFormValues>;
  fieldName: "dancerIds" | "professorIds";
  label: string;
  onToggle?: () => void;
  optionId: string;
}) {
  return (
    <Controller
      control={control}
      name={fieldName}
      render={({ field, fieldState }) => {
        const currentValue = field.value ?? [];
        const isChecked = currentValue.includes(optionId);
        const isInvalid = Boolean(fieldState.error?.message);

        return (
          <Field data-invalid={isInvalid ? true : undefined}>
            <FieldLabel>
              <Field className="items-center gap-3 rounded-lg border px-3 py-2">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    field.onChange(
                      toggleSelectedValue(currentValue, optionId, checked),
                    );
                    onToggle?.();
                  }}
                  aria-invalid={isInvalid ? true : undefined}
                />
                <span className="text-sm">{label}</span>
              </Field>
            </FieldLabel>
          </Field>
        );
      }}
    />
  );
}

function setRequiredFieldError(
  form: CreateChoreographyForm,
  fieldName: ManualRequiredFieldName,
) {
  form.setError(fieldName, {
    message: requiredFieldMessage,
    type: "manual",
  });
}

function toggleSelectedValue(
  currentValue: string[],
  optionId: string,
  checked: boolean | "indeterminate",
) {
  if (checked === true) {
    return [...currentValue, optionId];
  }

  return currentValue.filter((value) => value !== optionId);
}

function getCalculationError(data: CalculationActionData | undefined) {
  return data?.intent === RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT &&
    !data.result.ok
    ? data.result.error
    : null;
}

function getSubmissionError(data: CreateActionData | undefined) {
  return data?.intent === CREATE_CHOREOGRAPHY_INTENT ? data.result.error : null;
}

function formatGroupTypeLabel(
  groupType: RegistrationResolution["groupType"] | string,
) {
  if (groupType === "solo") {
    return "Solo";
  }

  if (groupType === "duo") {
    return "Dúo";
  }

  if (groupType === "trio") {
    return "Trío";
  }

  return "Grupal";
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
    ? `${modalityName} · ${submodalityName}`
    : modalityName;
}

function formatScheduleSummary(
  resolution: RegistrationResolution,
  scheduleEntryId: string,
) {
  if (resolution.schedule.status === "none") {
    return "Sin cronograma compatible";
  }

  const selectedOption =
    resolution.schedule.status === "auto"
      ? resolution.schedule.options[0]
      : resolution.schedule.options.find(
          (option) => option.id === scheduleEntryId,
        );

  if (!selectedOption) {
    return "Pendiente";
  }

  return `${selectedOption.scheduleBlock.name} · ${formatGroupTypeLabel(selectedOption.groupTypeKey)}`;
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

function buildResolveChoreographyFormData(input: {
  eventId: string;
  modalityId: string;
  submodalityId: string;
  canChooseSubmodality: boolean;
  dancerIds: string[];
}) {
  const formData = new FormData();
  formData.set("intent", RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT);
  formData.set("eventId", input.eventId);
  formData.set("modalityId", input.modalityId);
  setOptionalFormString(
    formData,
    "submodalityId",
    input.canChooseSubmodality ? input.submodalityId : "",
  );
  appendFormStringArray(formData, "dancerIds", input.dancerIds);

  return formData;
}

function buildCreateChoreographyFormData(input: {
  eventId: string;
  name: string;
  modalityId: string;
  submodalityId: string;
  canChooseSubmodality: boolean;
  dancerIds: string[];
  professorIds: string[];
  experienceLevelId: string;
  scheduleEntryId: string;
}) {
  const formData = new FormData();
  formData.set("intent", CREATE_CHOREOGRAPHY_INTENT);
  formData.set("eventId", input.eventId);
  formData.set("name", input.name);
  formData.set("modalityId", input.modalityId);
  setOptionalFormString(
    formData,
    "submodalityId",
    input.canChooseSubmodality ? input.submodalityId : "",
  );
  appendFormStringArray(formData, "dancerIds", input.dancerIds);
  appendFormStringArray(formData, "professorIds", input.professorIds);
  setOptionalFormString(formData, "experienceLevelId", input.experienceLevelId);
  formData.set("scheduleEntryId", input.scheduleEntryId);

  return formData;
}

function setOptionalFormString(formData: FormData, key: string, value: string) {
  if (value) {
    formData.set(key, value);
  }
}

function appendFormStringArray(
  formData: FormData,
  key: string,
  values: string[],
) {
  for (const value of values) {
    formData.append(key, value);
  }
}

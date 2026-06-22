import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Controller,
  useForm,
  type Control,
  type UseFormReturn,
} from "react-hook-form";
import {
  Link,
  redirect,
  useActionData,
  useFetcher,
  useNavigation,
  useSearchParams,
  useSubmit,
} from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { AccessNotice } from "@/components/auth/access-ui";
import {
  PortalEmptyState,
  PortalListPage,
  type PortalRouteHandle,
} from "@/components/portal/ui";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import { Badge } from "@/components/ui/badge";
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
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  formatGroupTypeLabel as formatChoreographyGroupTypeLabel,
  formatOperationalStatusLabel,
  type ChoreographyListItem,
} from "@/lib/portal/choreographies";
import { showRouteNotificationToast } from "@/lib/shared/route-notification-toasts";
import {
  createChoreographyRegistration,
  type CreateChoreographyRegistrationResult,
} from "@/lib/choreographies/registration-confirmation.server";
import {
  resolveChoreographyRegistrationOperation,
  type ChoreographyRegistrationOperationResult,
} from "@/lib/choreographies/registration-resolution.server";
import { listChoreographiesForAcademyEvent } from "@/lib/portal/choreographies.server";
import { getPortalChoreographyCreationAvailability } from "@/lib/portal/choreography-creation-availability";
import { countActiveDancersForAcademy } from "@/lib/portal/dancers.server";
import { getPortalActiveEventReadinessContext } from "@/lib/portal/event-context.server";
import type { ChoreographyRegistrationBaseOptions } from "@/lib/events/bases.server";
import { isRouteFormPending, requiredFieldMessage } from "@/lib/shared/forms";
import type { loader as createChoreographyOptionsLoader } from "@/routes/portal.coreografias_.crear";

type PortalCoreografiasRouteProps = {
  actionData?: CreateActionData;
  loaderData: Awaited<ReturnType<typeof loader>>;
  created?: boolean;
  deleted?: boolean;
  initialCreateDialogOpen?: boolean;
};

type PortalCoreografiasLoaderData = PortalCoreografiasRouteProps["loaderData"];
type PortalCoreografiasEventContext =
  PortalCoreografiasLoaderData["eventContext"];
type CreateChoreographyOptionsLoaderData = Awaited<
  ReturnType<typeof createChoreographyOptionsLoader>
>;
type RegistrationResolution = Extract<
  ChoreographyRegistrationOperationResult,
  { ok: true }
>["resolution"];

type CalculationActionData = {
  intent: "resolve-choreography-registration";
  result: ChoreographyRegistrationOperationResult;
};

type CreateActionData = {
  status: "create-error";
  intent: "create-choreography";
  result: Exclude<CreateChoreographyRegistrationResult, { ok: true }>;
  modalOpen: true;
};

const RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT =
  "resolve-choreography-registration";
const CREATE_CHOREOGRAPHY_INTENT = "create-choreography";

type CreateChoreographyStep =
  | "name"
  | "modality"
  | "submodality"
  | "dancers"
  | "experienceLevel"
  | "schedule"
  | "professors"
  | "summary";

const CREATE_CHOREOGRAPHY_STEP_LABELS: Record<CreateChoreographyStep, string> =
  {
    name: "Nombre",
    modality: "Modalidad",
    submodality: "Submodalidad",
    dancers: "Bailarines",
    experienceLevel: "Nivel",
    schedule: "Cronograma",
    professors: "Profesores",
    summary: "Resumen",
  };

const CREATE_CHOREOGRAPHY_RESOLUTION_ERROR_TOAST_ID =
  "create-choreography-resolution-error";

const createChoreographySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, requiredFieldMessage)
    .max(
      120,
      "El nombre de la coreografía no puede superar los 120 caracteres.",
    ),
  modalityId: z.string().trim().min(1, requiredFieldMessage),
  submodalityId: z.string().trim().optional(),
  dancerIds: z.array(z.string()).min(1, requiredFieldMessage),
  professorIds: z.array(z.string()),
  experienceLevelId: z.string().trim().optional(),
  scheduleCapacityId: z.string().trim().optional(),
});

type CreateChoreographyFormValues = z.infer<typeof createChoreographySchema>;
type CreateChoreographyForm = UseFormReturn<CreateChoreographyFormValues>;
type ManualRequiredFieldName =
  | "experienceLevelId"
  | "scheduleCapacityId"
  | "submodalityId";

const emptyCreateChoreographyValues: CreateChoreographyFormValues = {
  name: "",
  modalityId: "",
  submodalityId: "",
  dancerIds: [],
  professorIds: [],
  experienceLevelId: "",
  scheduleCapacityId: "",
};

export const meta = () => [
  { title: "Coreografías | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Coreografías" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalActiveEventReadinessContext(request);
  const selectedEventId = eventContext.selectedEvent?.id ?? null;
  const [choreographies, activeDancerCount] = await Promise.all([
    selectedEventId
      ? listChoreographiesForAcademyEvent(academy.id, selectedEventId)
      : Promise.resolve([]),
    countActiveDancersForAcademy(academy.id),
  ]);

  return {
    choreographies,
    eventContext,
    activeDancerCount,
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
      scheduleCapacityId: readFormString(formData, "scheduleCapacityId"),
    });

    if (!result.ok) {
      return {
        status: "create-error",
        intent,
        modalOpen: true,
        result,
      } satisfies CreateActionData;
    }

    throw redirect("/portal/coreografias?creada=1");
  }

  throw new Response("Acción no soportada.", { status: 400 });
}

export function PortalCoreografiasRouteView({
  actionData,
  loaderData,
  created = false,
  deleted = false,
  initialCreateDialogOpen = false,
}: PortalCoreografiasRouteProps) {
  const selectedEvent = loaderData.eventContext.selectedEvent;
  const creationAvailability = getPortalChoreographyCreationAvailability({
    activeDancerCount: loaderData.activeDancerCount,
    eventContext: loaderData.eventContext,
  });
  const creationOptionsFetcher =
    useFetcher<typeof createChoreographyOptionsLoader>();
  const creationOptionsData = creationOptionsFetcher.data;
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(
    initialCreateDialogOpen || actionData?.modalOpen === true,
  );
  const [dismissServerState, setDismissServerState] = useState(false);

  useEffect(() => {
    if (actionData?.modalOpen === true) {
      setIsCreateModalOpen(true);
      setDismissServerState(false);
    }
  }, [actionData]);

  useEffect(() => {
    if (created) {
      setIsCreateModalOpen(false);
      setDismissServerState(true);
      showRouteNotificationToast("coreografia-creada");
    }
  }, [created]);

  useEffect(() => {
    if (!isCreateModalOpen || !selectedEvent) {
      return;
    }

    if (
      creationOptionsFetcher.state !== "idle" ||
      creationOptionsData?.eventId === selectedEvent.id
    ) {
      return;
    }

    void creationOptionsFetcher.load("/portal/coreografias/crear");
  }, [
    creationOptionsData?.eventId,
    creationOptionsFetcher,
    creationOptionsFetcher.state,
    isCreateModalOpen,
    selectedEvent,
  ]);

  const visibleActionData = dismissServerState ? undefined : actionData;
  const createModalOptions =
    creationOptionsData?.eventId === selectedEvent?.id
      ? creationOptionsData
      : null;

  return (
    <>
      <PortalListPage
        titleId="coreografias-title"
        title="Coreografías"
        description="Gestioná las coreografías de tu academia que van a participar del evento y seguí su estado operativo."
        action={
          selectedEvent ? (
            <Button
              type="button"
              disabled={!creationAvailability.canCreate}
              onClick={() => {
                setDismissServerState(true);
                setIsCreateModalOpen(true);
              }}
            >
              <Plus aria-hidden="true" data-icon />
              Nueva coreografía
            </Button>
          ) : null
        }
      >
        {deleted ? (
          <AccessNotice variant="success">
            La coreografía se eliminó correctamente.
          </AccessNotice>
        ) : null}

        {selectedEvent && loaderData.choreographies.length > 0 ? (
          <ChoreographyTable choreographies={loaderData.choreographies} />
        ) : (
          <PortalEmptyState
            title={getCoreografiasEmptyTitle(loaderData.eventContext)}
            description={getCoreografiasEmptyDescription(
              loaderData.eventContext,
            )}
          />
        )}
      </PortalListPage>

      {isCreateModalOpen && selectedEvent ? (
        createModalOptions ? (
          <CreateChoreographyModal
            actionData={visibleActionData}
            baseOptions={createModalOptions.registrationBaseOptions}
            dancers={createModalOptions.activeDancers}
            eventId={selectedEvent.id}
            professors={createModalOptions.activeProfessors}
            onClose={() => {
              setDismissServerState(true);
              setIsCreateModalOpen(false);
            }}
          />
        ) : (
          <CreateChoreographyOptionsLoadingDialog
            onClose={() => {
              setDismissServerState(true);
              setIsCreateModalOpen(false);
            }}
          />
        )
      ) : null}
    </>
  );
}

export default function PortalCoreografiasRoute({
  loaderData,
}: {
  loaderData: Awaited<ReturnType<typeof loader>>;
}) {
  const actionData = useActionData<typeof action>();
  const createActionData = getCreateActionData(actionData);
  const [searchParams] = useSearchParams();

  return (
    <PortalCoreografiasRouteView
      actionData={createActionData}
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
      cell: (choreography) => (
        <span className="text-muted-foreground">
          {formatPrimaryAndSecondaryValue(
            choreography.modalityName,
            choreography.submodalityName,
          )}
        </span>
      ),
      filterValue: (choreography) =>
        [choreography.modalityName, choreography.submodalityName]
          .filter(Boolean)
          .join(" "),
    },
    {
      id: "categoryGroup",
      header: "Categoría / Tipo de grupo",
      cell: (choreography) => (
        <span className="text-muted-foreground">
          {formatPrimaryAndSecondaryValue(
            choreography.categoryName ?? "Sin asignar",
            formatChoreographyGroupTypeLabel(choreography.groupType),
          )}
        </span>
      ),
      filterValue: (choreography) =>
        [
          choreography.categoryName ?? "Sin asignar",
          formatChoreographyGroupTypeLabel(choreography.groupType),
        ].join(" "),
    },
    {
      id: "status",
      header: "Estado",
      cell: (choreography) => (
        <OperationalStatusBadge choreography={choreography} />
      ),
      filterValues: (choreography) => [
        choreography.operationalStatus.code,
        choreography.modalityName,
        choreography.categoryName ?? "pending-category",
        choreography.groupType,
      ],
    },
  ];

  return (
    <DataTable
      mode="client"
      rows={choreographies}
      columns={columns}
      getRowKey={(choreography) => choreography.id}
      searchPlaceholder="Buscar coreografía por nombre, modalidad o categoría"
      textFilterColumnId="name"
      facetedFilters={buildChoreographyFacetedFilters(choreographies)}
      emptyMessage="No hay coreografías que coincidan con la búsqueda o los filtros."
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}

function buildChoreographyFacetedFilters(
  choreographies: ChoreographyListItem[],
) {
  return [
    {
      columnId: "status",
      label: "Filtros",
      groups: [
        {
          label: "Estado",
          options: [
            { label: "Completa", value: "complete" },
            { label: "Incompleta", value: "incomplete" },
          ],
        },
        {
          label: "Modalidad",
          options: getUniqueSortedOptions(
            choreographies.map((choreography) => ({
              label: choreography.modalityName,
              value: choreography.modalityName,
            })),
          ),
        },
        {
          label: "Categoría",
          options: getUniqueSortedOptions(
            choreographies.map((choreography) => ({
              label: choreography.categoryName ?? "Sin asignar",
              value: choreography.categoryName ?? "pending-category",
            })),
          ),
        },
        {
          label: "Tipo de grupo",
          options: [
            { label: "Solo", value: "solo" },
            { label: "Dúo", value: "duo" },
            { label: "Trío", value: "trio" },
            { label: "Grupal", value: "grupal" },
          ],
        },
      ],
    },
  ];
}

function getUniqueSortedOptions(
  options: Array<{ label: string; value: string }>,
) {
  return Array.from(
    new Map(options.map((option) => [option.value, option])).values(),
  ).sort((firstOption, secondOption) =>
    firstOption.label.localeCompare(secondOption.label, "es-AR"),
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

function getCoreografiasEmptyTitle(
  eventContext: PortalCoreografiasEventContext,
) {
  if (!eventContext.selectedEvent) {
    return eventContext.hasEvents
      ? "Todavía no hay un evento activo"
      : "Todavía no hay eventos configurados";
  }

  return "No hay coreografías registradas para este evento";
}

function getCoreografiasEmptyDescription(
  eventContext: PortalCoreografiasEventContext,
) {
  if (!eventContext.selectedEvent) {
    return eventContext.hasEvents
      ? "Cuando administración active un evento, vas a poder consultar las coreografías de tu academia desde esta sección."
      : "Cuando administración cree un evento, vas a poder consultar las coreografías de tu academia desde esta sección.";
  }

  return "Cuando registres una coreografía para el evento activo, la vas a poder seguir acá junto con su estado operativo.";
}

function formatPrimaryAndSecondaryValue(
  primaryValue: string,
  secondaryValue: string | null,
) {
  return secondaryValue ? `${primaryValue} · ${secondaryValue}` : primaryValue;
}

function CreateChoreographyOptionsLoadingDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg" overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Nueva coreografía</DialogTitle>
          <DialogDescription>
            Estamos preparando las opciones para registrar la coreografía.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="animate-spin" data-icon />
          Cargando bailarines, profesores y bases del evento...
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateChoreographyModal({
  actionData,
  baseOptions,
  dancers,
  eventId,
  professors,
  onClose,
}: {
  actionData?: CreateActionData;
  baseOptions: ChoreographyRegistrationBaseOptions;
  dancers: CreateChoreographyOptionsLoaderData["activeDancers"];
  eventId: string;
  professors: CreateChoreographyOptionsLoaderData["activeProfessors"];
  onClose: () => void;
}) {
  const calculationFetcher = useFetcher<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const nameFieldId = useId();
  const modalityFieldId = useId();
  const submodalityFieldId = useId();
  const experienceLevelFieldId = useId();
  const scheduleCapacityFieldId = useId();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [resolution, setResolution] = useState<RegistrationResolution | null>(
    null,
  );
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
  const calculationData = calculationFetcher.data as
    | CalculationActionData
    | undefined;
  const canChooseSubmodality = selectedSubmodalities.length > 0;
  const isResolving = calculationFetcher.state !== "idle";
  const isSubmitting = isRouteFormPending(navigation, {
    intent: CREATE_CHOREOGRAPHY_INTENT,
  });
  const submissionError = getSubmissionError(actionData);
  const registrationSteps = useMemo(
    () => getCreateChoreographySteps({ canChooseSubmodality, resolution }),
    [canChooseSubmodality, resolution],
  );
  const currentStep = registrationSteps[currentStepIndex] ?? "name";

  useEffect(() => {
    if (calculationData?.intent !== RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT) {
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
  }, [canChooseSubmodality, calculationData, form]);

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

  function handleClose() {
    onClose();
  }

  async function handleAdvanceFromName() {
    const isValid = await form.trigger("name");

    if (isValid) {
      setCurrentStepIndex(1);
    }
  }

  async function handleAdvanceFromModality() {
    const isValid = await form.trigger("modalityId");

    if (!isValid) {
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

  async function handleAdvanceFromExperienceLevel() {
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

  async function handleAdvanceFromSchedule() {
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

  function handleAdvanceFromProfessors() {
    setCurrentStepIndex((stepIndex) => stepIndex + 1);
  }

  function handleConfirm() {
    submit(
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
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSubmitting) {
          handleClose();
        }
      }}
    >
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
                  onValueChange={() => {
                    resetResolutionState();
                  }}
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
                selectedModalityId={selectedModalityId}
                selectedProfessors={selectedProfessors}
                selectedScheduleCapacityId={selectedScheduleCapacityId}
                selectedSubmodalityId={selectedSubmodalityId}
                selectedExperienceLevelId={selectedExperienceLevelId}
              />
            ) : null}
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={
              currentStepIndex === 0
                ? handleClose
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
                onClick={() => void handleAdvanceFromExperienceLevel()}
              >
                Siguiente
                <ChevronRight aria-hidden="true" data-icon />
              </Button>
            ) : null}

            {currentStep === "schedule" ? (
              <Button
                type="button"
                disabled={!canAdvanceFromSchedule}
                onClick={() => void handleAdvanceFromSchedule()}
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
  selectedProfessors: CreateChoreographyOptionsLoaderData["activeProfessors"];
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
    ...(resolution.experienceLevel.required
      ? [
          {
            label: "Nivel de experiencia",
            value: formatExperienceLevelSummary(
              resolution,
              selectedExperienceLevelId,
            ),
          },
        ]
      : []),
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
  ];

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

function getCreateChoreographySteps(input: {
  canChooseSubmodality: boolean;
  resolution: RegistrationResolution | null;
}): CreateChoreographyStep[] {
  const steps: CreateChoreographyStep[] = ["name", "modality"];

  if (input.canChooseSubmodality) {
    steps.push("submodality");
  }

  steps.push("dancers");

  if (input.resolution?.experienceLevel.required) {
    steps.push("experienceLevel");
  }

  if (input.resolution?.schedule.status === "multiple") {
    steps.push("schedule");
  }

  steps.push("professors", "summary");

  return steps;
}

function getFirstPostResolutionStepIndex(input: {
  canChooseSubmodality: boolean;
  resolution: RegistrationResolution;
}) {
  return getCreateChoreographySteps(input).findIndex(
    (step) =>
      step === "experienceLevel" ||
      step === "schedule" ||
      step === "professors",
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

function setRequiredFieldError(
  form: CreateChoreographyForm,
  fieldName: ManualRequiredFieldName,
) {
  form.setError(fieldName, {
    message: requiredFieldMessage,
    type: "manual",
  });
}

function getSubmissionError(data: CreateActionData | undefined) {
  if (!data || data.status !== "create-error") {
    return null;
  }

  return data.intent === CREATE_CHOREOGRAPHY_INTENT ? data.result.error : null;
}

function getCreateActionData(
  actionData: CalculationActionData | CreateActionData | undefined,
) {
  return actionData?.intent === CREATE_CHOREOGRAPHY_INTENT
    ? actionData
    : undefined;
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
  if (resolution.schedule.status === "none") {
    return "Sin cupo de cronograma compatible";
  }

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
  const normalizedWeekday = capitalizeFirstLetter(weekday);
  const monthName = new Intl.DateTimeFormat("es-AR", {
    month: "long",
  }).format(date);
  const formattedTime = input.startTime.slice(0, 5);

  return `${normalizedWeekday} ${day} de ${monthName} - ${formattedTime} hs.`;
}

function capitalizeFirstLetter(value: string) {
  return value.charAt(0).toLocaleUpperCase("es-AR") + value.slice(1);
}

function formatPeopleSummary(
  people: Array<{ firstName: string; lastName: string }>,
  noun: "bailarines" | "profesores",
) {
  if (people.length === 0) {
    return noun === "profesores"
      ? "Sin profesores seleccionados"
      : "Sin bailarines seleccionados";
  }

  if (people.length > 3) {
    return `${people.length} ${noun} seleccionados`;
  }

  return people
    .map((person) => `${person.firstName} ${person.lastName}`)
    .join(" - ");
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
  scheduleCapacityId: string;
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
  formData.set("scheduleCapacityId", input.scheduleCapacityId);

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

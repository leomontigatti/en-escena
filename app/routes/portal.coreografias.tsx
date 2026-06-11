import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, redirect, useFetcher, useSearchParams } from "react-router";
import { clsx } from "clsx";

import { AccessNotice, AccessSecondaryLink } from "@/components/access-ui";
import { PortalEmptyList, PortalShell } from "@/components/portal-ui";
import { requireAcademyUser } from "@/lib/internal-access.server";
import {
  formatOperationalStatusLabel,
  type ChoreographyListItem,
} from "@/lib/portal-choreographies";
import {
  createChoreographyRegistration,
  resolveChoreographyRegistrationOperation,
  type ChoreographyRegistrationOperationResult,
  type CreateChoreographyRegistrationResult,
} from "@/lib/portal-choreography-registration.server";
import { listChoreographiesForAcademyEvent } from "@/lib/portal-choreographies.server";
import { listAcademyProfessors } from "@/lib/portal-professors.server";
import { listDancersForAcademy } from "@/lib/portal-dancers.server";
import { getPortalEventContext } from "@/lib/portal-event-context.server";
import { listEventCatalogs } from "@/lib/admin-catalogs.server";

type PortalCoreografiasRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
  created?: boolean;
  deleted?: boolean;
};

type PortalCoreografiasLoaderData = PortalCoreografiasRouteProps["loaderData"];
type PortalEventContext = PortalCoreografiasLoaderData["eventContext"];
type RegistrationResolution = Extract<
  ChoreographyRegistrationOperationResult,
  { ok: true }
>["resolution"];

type RegistrationCatalogs = {
  modalities: Array<{ id: string; name: string }>;
  submodalities: Array<{ id: string; name: string; modalityId: string }>;
};

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

export const meta = () => [
  { title: "Coreografías | Portal de academias | En Escena" },
];

export async function loader({ request }: { request: Request }) {
  const { user, academy } = await requireAcademyUser(request);
  const eventContext = await getPortalEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id ?? null;
  const [choreographies, activeDancers, activeProfessors, catalogs] =
    await Promise.all([
      selectedEventId
        ? listChoreographiesForAcademyEvent(academy.id, selectedEventId)
        : Promise.resolve([]),
      listDancersForAcademy(academy.id, { status: "active" }),
      listAcademyProfessors(academy.id, { status: "active" }),
      selectedEventId
        ? listEventCatalogs(selectedEventId)
        : Promise.resolve(null),
    ]);

  return {
    email: user.email,
    academy,
    choreographies,
    eventContext,
    activeDancers,
    activeProfessors,
    registrationCatalogs: catalogs
      ? {
          modalities: catalogs.modalities.map((modality) => ({
            id: modality.id,
            name: modality.name,
          })),
          submodalities: catalogs.submodalities.map((submodality) => ({
            id: submodality.id,
            name: submodality.name,
            modalityId: submodality.modalityId,
          })),
        }
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

    throw redirect(
      `/portal/coreografias?evento=${encodeURIComponent(result.choreography.eventId)}&creada=1`,
    );
  }

  throw new Response("Acción no soportada.", { status: 400 });
}

export function PortalCoreografiasRouteView({
  loaderData,
  created = false,
  deleted = false,
}: PortalCoreografiasRouteProps) {
  const selectedEvent = loaderData.eventContext.selectedEvent;
  const eventStatus = getEventStatus(loaderData.eventContext.isReadOnly);
  const creationState = getCreationState(
    loaderData.eventContext,
    loaderData.activeDancers.length,
  );
  const selectedEventSearch = selectedEvent
    ? `?${loaderData.eventContext.queryParamName}=${selectedEvent.id}`
    : "";
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  return (
    <PortalShell
      email={loaderData.email}
      academyName={loaderData.academy.name}
      description={
        <>
          Consultá las coreografías de la academia según el Evento consultado.
        </>
      }
    >
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
              La lista se limita al Evento consultado y a tu academia.
            </p>
          </div>
          <PortalEventSelector eventContext={loaderData.eventContext} />
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
                    cada Coreografía del Evento consultado.
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
                <ChoreographyTable
                  choreographies={loaderData.choreographies}
                  selectedEventSearch={selectedEventSearch}
                />
              ) : (
                <PortalEmptyList
                  title="No hay coreografías registradas para este evento"
                  description="Cuando registres una Coreografía para este Evento consultado, la vas a poder seguir acá junto con su estado operativo."
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

      {isCreateModalOpen && selectedEvent && loaderData.registrationCatalogs ? (
        <CreateChoreographyModal
          catalogs={loaderData.registrationCatalogs}
          dancers={loaderData.activeDancers}
          eventId={selectedEvent.id}
          eventName={selectedEvent.name}
          professors={loaderData.activeProfessors}
          onClose={() => setIsCreateModalOpen(false)}
        />
      ) : null}

      <AccessSecondaryLink to="/portal" className="mt-8">
        Volver al inicio
      </AccessSecondaryLink>
    </PortalShell>
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
  selectedEventSearch,
}: {
  choreographies: PortalCoreografiasRouteProps["loaderData"]["choreographies"];
  selectedEventSearch: string;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {CHOREOGRAPHY_TABLE_HEADERS.map((header) => (
              <th key={header} className={CHOREOGRAPHY_TABLE_HEADER_CLASS_NAME}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {choreographies.map((choreography) => (
            <tr key={choreography.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-950">
                <Link
                  to={`/portal/coreografias/${choreography.id}${selectedEventSearch}`}
                  className="rounded-sm underline-offset-4 hover:text-teal-800 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
                >
                  {choreography.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-700">
                {formatPrimaryAndSecondaryValue(
                  choreography.modalityName,
                  choreography.submodalityName,
                )}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {formatPrimaryAndSecondaryValue(
                  choreography.categoryName ?? "Categoría pendiente",
                  choreography.experienceLevelName,
                )}
              </td>
              <td className="px-4 py-3">
                <OperationalStatusBadge choreography={choreography} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OperationalStatusBadge({
  choreography,
}: {
  choreography: ChoreographyListItem;
}) {
  if (choreography.operationalStatus.code === "complete") {
    return (
      <span className="inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
        Completa
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
      {formatOperationalStatusLabel(choreography.operationalStatus)}
    </span>
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

const CHOREOGRAPHY_TABLE_HEADERS = [
  "Nombre",
  "Modalidad / Submodalidad",
  "Categoría / Nivel",
  "Estado operativo",
] as const;

const CHOREOGRAPHY_TABLE_HEADER_CLASS_NAME =
  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600";

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

  if (eventContext.selectedEvent !== null && eventContext.isReadOnly) {
    return {
      tone: "blocked",
      message:
        "Solo podés crear coreografías cuando el Evento consultado coincide con el Evento activo.",
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
      "La creación de coreografías va a estar disponible solo cuando el Evento consultado sea el Evento activo y la inscripción esté abierta.",
    canCreate: false,
  };
}

function getEventStatus(isReadOnly: boolean) {
  if (isReadOnly) {
    return {
      label: "Evento consultado",
      className: `${EVENT_STATUS_BADGE_CLASS_NAME} bg-amber-50 text-amber-800`,
    };
  }

  return {
    label: "Evento activo",
    className: `${EVENT_STATUS_BADGE_CLASS_NAME} bg-emerald-50 text-emerald-800`,
  };
}

function formatPrimaryAndSecondaryValue(
  primaryValue: string,
  secondaryValue: string | null,
) {
  return secondaryValue ? `${primaryValue} · ${secondaryValue}` : primaryValue;
}

function PortalEventSelector({
  eventContext,
}: {
  eventContext: PortalEventContext;
}) {
  if (!eventContext.hasEvents) {
    return null;
  }

  return (
    <form method="get" className="w-full sm:max-w-xs">
      <label
        htmlFor="evento-consultado"
        className="block text-sm font-medium text-slate-800"
      >
        Evento consultado
      </label>
      <div className="mt-2 flex gap-2">
        <select
          id="evento-consultado"
          name={eventContext.queryParamName}
          defaultValue={eventContext.selectedEvent?.id}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus-visible:border-teal-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          {eventContext.events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          Consultar
        </button>
      </div>
    </form>
  );
}

function CreateChoreographyModal({
  catalogs,
  dancers,
  eventId,
  eventName,
  professors,
  onClose,
}: {
  catalogs: RegistrationCatalogs;
  dancers: PortalCoreografiasLoaderData["activeDancers"];
  eventId: string;
  eventName: string;
  professors: PortalCoreografiasLoaderData["activeProfessors"];
  onClose: () => void;
}) {
  const calculationFetcher = useFetcher<typeof action>();
  const submissionFetcher = useFetcher<typeof action>();
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState("");
  const [modalityId, setModalityId] = useState("");
  const [submodalityId, setSubmodalityId] = useState("");
  const [selectedDancerIds, setSelectedDancerIds] = useState<string[]>([]);
  const [selectedProfessorIds, setSelectedProfessorIds] = useState<string[]>(
    [],
  );
  const [experienceLevelId, setExperienceLevelId] = useState("");
  const [scheduleEntryId, setScheduleEntryId] = useState("");
  const [resolution, setResolution] = useState<RegistrationResolution | null>(
    null,
  );

  const selectedSubmodalities = useMemo(
    () =>
      catalogs.submodalities.filter(
        (submodality) => submodality.modalityId === modalityId,
      ),
    [catalogs.submodalities, modalityId],
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
  const nameError = getNameError(name);
  const isDirty =
    name.length > 0 ||
    modalityId.length > 0 ||
    submodalityId.length > 0 ||
    selectedDancerIds.length > 0 ||
    selectedProfessorIds.length > 0;

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
          (option) => option.id === experienceLevelId,
        )
      ) {
        setExperienceLevelId(
          nextResolution.experienceLevel.options[0]?.id ?? "",
        );
      }
    } else {
      setExperienceLevelId("");
    }

    if (nextResolution.schedule.status === "auto") {
      setScheduleEntryId(nextResolution.schedule.scheduleEntryId);
    } else if (
      nextResolution.schedule.status === "multiple" &&
      !nextResolution.schedule.options.some(
        (option) => option.id === scheduleEntryId,
      )
    ) {
      setScheduleEntryId("");
    }

    setCurrentStep(3);
  }, [calculationData, experienceLevelId, scheduleEntryId]);

  function resetResolutionState() {
    setResolution(null);
    setExperienceLevelId("");
    setScheduleEntryId("");
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

  function toggleSelection(
    currentValues: string[],
    nextValue: string,
    onChange: (values: string[]) => void,
  ) {
    onChange(
      currentValues.includes(nextValue)
        ? currentValues.filter((value) => value !== nextValue)
        : [...currentValues, nextValue],
    );
  }

  function handleResolveStep() {
    calculationFetcher.submit(
      buildResolveChoreographyFormData({
        eventId,
        modalityId,
        submodalityId,
        canChooseSubmodality,
        dancerIds: selectedDancerIds,
      }),
      { method: "post" },
    );
  }

  function handleConfirm() {
    submissionFetcher.submit(
      buildCreateChoreographyFormData({
        eventId,
        name,
        modalityId,
        submodalityId,
        canChooseSubmodality,
        dancerIds: selectedDancerIds,
        professorIds: selectedProfessorIds,
        experienceLevelId,
        scheduleEntryId,
      }),
      { method: "post" },
    );
  }

  const canAdvanceFromName = nameError === null;
  const canAdvanceFromModality =
    modalityId.length > 0 &&
    (!canChooseSubmodality || submodalityId.length > 0);
  const canResolve = selectedDancerIds.length > 0;
  const canAdvanceFromResolution =
    resolution !== null &&
    (!resolution.experienceLevel.required || experienceLevelId.length > 0) &&
    (resolution.schedule.status === "auto" ||
      (resolution.schedule.status === "multiple" &&
        scheduleEntryId.length > 0));

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Registrar Coreografía
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {eventName}. El alta se confirma recién en el último paso.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            Cerrar
          </button>
        </div>

        <ol className="mt-6 grid gap-2 text-sm text-slate-600 sm:grid-cols-5">
          {CHOREOGRAPHY_REGISTRATION_STEP_LABELS.map((label, index) => (
            <li
              key={label}
              className={clsx(
                "rounded-md border px-3 py-2",
                currentStep === index
                  ? "border-teal-200 bg-teal-50 text-teal-900"
                  : "border-slate-200 bg-slate-50",
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

        <div className="mt-6 space-y-6">
          {currentStep === 0 ? (
            <section className="space-y-4">
              <PortalField
                id="coreografia-name"
                label="Nombre"
                value={name}
                onChange={(value) => setName(value)}
                placeholder="Ej.: Danza de la luna"
              />
              <p className="text-xs text-slate-500">
                El nombre se normaliza al confirmar. Se permiten duplicados.
              </p>
              {nameError ? (
                <p className="text-xs font-medium text-red-700">{nameError}</p>
              ) : null}
            </section>
          ) : null}

          {currentStep === 1 ? (
            <section className="space-y-4">
              <SelectField
                id="coreografia-modality"
                label="Modalidad"
                value={modalityId}
                onChange={(value) => {
                  setModalityId(value);
                  setSubmodalityId("");
                  resetResolutionState();
                }}
                options={catalogs.modalities.map((modality) => ({
                  value: modality.id,
                  label: modality.name,
                }))}
              />

              {canChooseSubmodality ? (
                <SelectField
                  id="coreografia-submodality"
                  label="Submodalidad"
                  value={submodalityId}
                  onChange={(value) => {
                    setSubmodalityId(value);
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
            <section className="space-y-6">
              <fieldset>
                <legend className="text-sm font-medium text-slate-800">
                  Bailarines
                </legend>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Elegí uno o más Bailarines activos. No se crean registros en
                  línea desde esta ficha.
                </p>
                <div className="mt-3 space-y-2">
                  {dancers.map((dancer) => (
                    <label
                      key={dancer.id}
                      className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800"
                    >
                      <input
                        checked={selectedDancerIds.includes(dancer.id)}
                        onChange={() => {
                          toggleSelection(
                            selectedDancerIds,
                            dancer.id,
                            setSelectedDancerIds,
                          );
                          resetResolutionState();
                        }}
                        type="checkbox"
                      />
                      <span>
                        {dancer.lastName}, {dancer.firstName}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-medium text-slate-800">
                  Profesores
                </legend>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  La asignación es opcional y se puede dejar vacía.
                </p>
                <div className="mt-3 space-y-2">
                  {professors.length > 0 ? (
                    professors.map((professor) => (
                      <label
                        key={professor.id}
                        className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800"
                      >
                        <input
                          checked={selectedProfessorIds.includes(professor.id)}
                          onChange={() =>
                            toggleSelection(
                              selectedProfessorIds,
                              professor.id,
                              setSelectedProfessorIds,
                            )
                          }
                          type="checkbox"
                        />
                        <span>
                          {professor.lastName}, {professor.firstName}
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-600">
                      No hay Profesores activos para vincular.
                    </p>
                  )}
                </div>
              </fieldset>

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
                <SelectField
                  id="coreografia-experience-level"
                  label="Nivel de experiencia"
                  value={experienceLevelId}
                  onChange={setExperienceLevelId}
                  options={resolution.experienceLevel.options.map((option) => ({
                    value: option.id,
                    label: option.name,
                  }))}
                />
              ) : (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Esta selección no requiere Nivel de experiencia.
                </p>
              )}

              {resolution.schedule.status === "none" ? (
                <AccessNotice variant="error">
                  {resolution.schedule.error}
                </AccessNotice>
              ) : resolution.schedule.status === "auto" ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  El Cronograma compatible se selecciona automáticamente.
                </p>
              ) : (
                <SelectField
                  id="coreografia-schedule-entry"
                  label="Cronograma"
                  value={scheduleEntryId}
                  onChange={setScheduleEntryId}
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
                  value={name.trim() || "Sin nombre"}
                />
                <SummaryItem
                  label="Modalidad"
                  value={formatModalitySummary(
                    catalogs,
                    modalityId,
                    submodalityId,
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
                          (option) => option.id === experienceLevelId,
                        )?.name ?? "Pendiente")
                      : "No aplica"
                  }
                />
                <SummaryItem
                  label="Cronograma"
                  value={formatScheduleSummary(resolution, scheduleEntryId)}
                />
              </SummaryGrid>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-950">
                  Bailarines
                </h3>
                {resolution.groupType === "grupal" ? (
                  <p className="mt-2 text-sm text-slate-700">
                    {resolution.dancers.length} Bailarines seleccionados.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {resolution.dancers.map((dancer) => (
                      <li key={dancer.id}>
                        {dancer.lastName}, {dancer.firstName} · Edad al inicio
                        del Evento: {dancer.ageAtEventStart}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-950">
                  Profesores
                </h3>
                {selectedProfessors.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {selectedProfessors.map((professor) => (
                      <li key={professor.id}>
                        {professor.lastName}, {professor.firstName}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-700">
                    No se asignaron Profesores.
                  </p>
                )}
              </div>
            </section>
          ) : null}
        </div>

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={
              currentStep === 0
                ? handleClose
                : () => setCurrentStep((step) => step - 1)
            }
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            {currentStep === 0 ? "Cancelar" : "Volver"}
          </button>

          <div className="flex flex-col gap-3 sm:flex-row">
            {currentStep === 0 ? (
              <button
                type="button"
                disabled={!canAdvanceFromName}
                onClick={() => setCurrentStep(1)}
                className={primaryModalButtonClassName(canAdvanceFromName)}
              >
                Continuar
              </button>
            ) : null}

            {currentStep === 1 ? (
              <button
                type="button"
                disabled={!canAdvanceFromModality}
                onClick={() => setCurrentStep(2)}
                className={primaryModalButtonClassName(canAdvanceFromModality)}
              >
                Continuar
              </button>
            ) : null}

            {currentStep === 2 ? (
              <button
                type="button"
                disabled={!canResolve || isResolving}
                onClick={handleResolveStep}
                className={primaryModalButtonClassName(canResolve)}
              >
                {isResolving ? "Resolviendo..." : "Continuar"}
              </button>
            ) : null}

            {currentStep === 3 ? (
              <button
                type="button"
                disabled={!canAdvanceFromResolution}
                onClick={() => setCurrentStep(4)}
                className={primaryModalButtonClassName(
                  canAdvanceFromResolution,
                )}
              >
                Continuar
              </button>
            ) : null}

            {currentStep === 4 ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirm}
                className={primaryModalButtonClassName(true)}
              >
                {isSubmitting ? "Confirmando..." : "Confirmar Coreografía"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm text-slate-900">{value}</p>
    </div>
  );
}

function PortalField({
  id,
  label,
  onChange,
  placeholder,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="text"
        className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
      />
    </div>
  );
}

function SelectField({
  id,
  label,
  onChange,
  options,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  value: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
      >
        <option value="">Seleccionar</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function getNameError(value: string) {
  const collapsedValue = value.trim().replace(/\s+/g, " ");

  if (collapsedValue.length === 0) {
    return "Ingresá el nombre de la Coreografía.";
  }

  if (collapsedValue.length > 120) {
    return "El nombre de la Coreografía no puede superar los 120 caracteres.";
  }

  return null;
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

function primaryModalButtonClassName(enabled: boolean) {
  return clsx(
    "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100",
    enabled
      ? "bg-teal-700 text-white hover:bg-teal-800"
      : "cursor-not-allowed bg-slate-200 text-slate-500",
  );
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
  catalogs: RegistrationCatalogs,
  modalityId: string,
  submodalityId: string,
) {
  const modalityName =
    catalogs.modalities.find((modality) => modality.id === modalityId)?.name ??
    "Pendiente";
  const submodalityName = submodalityId
    ? (catalogs.submodalities.find(
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

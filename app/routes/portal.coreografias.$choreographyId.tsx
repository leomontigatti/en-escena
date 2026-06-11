import { Link, redirect, useActionData, useSearchParams } from "react-router";
import { clsx } from "clsx";

import { AccessNotice, AccessSecondaryLink } from "@/components/access-ui";
import { PortalShell } from "@/components/portal-ui";
import { requireAcademyUser } from "@/lib/internal-access.server";
import {
  formatGroupTypeLabel,
  formatOperationalPendingItemLabel,
  formatOperationalStatusLabel,
} from "@/lib/portal-choreographies";
import { getPortalEventContext } from "@/lib/portal-event-context.server";

const choreographyNotFoundMessage = "No encontramos esa Coreografía.";
const choreographyUpdatedSearchParam = "actualizado";
const choreographyUpdatedSuccessMessage =
  "Profesores actualizados correctamente.";

type ActionData =
  | {
      status: "error";
      message: string;
      selectedProfessorIds: string[];
    }
  | undefined;

type PortalCoreografiaDetalleRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
  actionData?: ActionData;
};

export const meta = () => [
  { title: "Detalle de Coreografía | Portal de academias | En Escena" },
];

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { choreographyId?: string };
}) {
  const { academy, user } = await requireAcademyUser(request);
  const choreographyId = params.choreographyId;

  if (!choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const eventContext = await getPortalEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id;

  if (!selectedEventId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const { findChoreographyForAcademyEvent } =
    await import("@/lib/portal-choreographies.server");
  const choreography = await findChoreographyForAcademyEvent(
    academy.id,
    selectedEventId,
    choreographyId,
  );

  if (!choreography) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const { listProfessorOptionsForChoreography } =
    await import("@/lib/portal-choreographies.server");
  const availableProfessors = await listProfessorOptionsForChoreography(
    academy.id,
    choreography.professors.map((professor) => professor.id),
  );

  return {
    email: user.email,
    academy,
    choreography,
    availableProfessors,
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
    throw new Response("Este Evento es de solo lectura.", { status: 403 });
  }

  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent !== "update-choreography-professors") {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const { updateChoreographyProfessors } =
    await import("@/lib/portal-choreographies.server");
  const professorIds = readFormStringArray(formData, "professorIds");
  const result = await updateChoreographyProfessors({
    academyId: academy.id,
    eventId: selectedEventId,
    choreographyId,
    professorIds,
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.message,
      selectedProfessorIds: professorIds,
    };
  }

  return redirect(
    `/portal/coreografias/${choreographyId}?${eventContext.queryParamName}=${selectedEventId}&${choreographyUpdatedSearchParam}=1`,
  );
}

export function PortalCoreografiaDetalleRouteView({
  loaderData,
  actionData: actionDataOverride,
}: PortalCoreografiaDetalleRouteProps) {
  const actionData = actionDataOverride;
  const backToList =
    loaderData.eventContext.selectedEvent !== null
      ? `/portal/coreografias?${loaderData.eventContext.queryParamName}=${loaderData.eventContext.selectedEvent.id}`
      : "/portal/coreografias";
  const canEditProfessors = !loaderData.eventContext.isReadOnly;
  const selectedProfessorIds = new Set(
    actionData?.selectedProfessorIds ??
      loaderData.choreography.professors.map((professor) => professor.id),
  );

  return (
    <PortalShell
      email={loaderData.email}
      academyName={loaderData.academy.name}
      description={
        <>Revisá los datos estructurales ya registrados de la Coreografía.</>
      }
    >
      <section className="mt-8 space-y-6" aria-labelledby="coreografia-title">
        <Link
          to={backToList}
          className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          Volver a Coreografías
        </Link>

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
              {loaderData.eventContext.isReadOnly
                ? "Solo lectura"
                : "Contexto editable"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Evento consultado: {loaderData.eventContext.selectedEvent?.name}
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

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-slate-950">Bailarines</h3>
            <ul className="mt-4 space-y-3">
              {loaderData.choreography.dancers.map((dancer) => (
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
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  Profesores
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {canEditProfessors
                    ? "Actualizá los Profesores operativos aunque la inscripción esté cerrada."
                    : "Los Profesores vinculados quedan en solo lectura para este Evento."}
                </p>
              </div>
              <span
                className={clsx(
                  "inline-flex rounded-md px-2.5 py-1 text-xs font-semibold",
                  canEditProfessors
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-slate-100 text-slate-700",
                )}
              >
                {canEditProfessors ? "Editable" : "Solo lectura"}
              </span>
            </div>

            {canEditProfessors ? (
              <form method="post" className="mt-4 space-y-4">
                <input
                  type="hidden"
                  name="intent"
                  value="update-choreography-professors"
                />
                {loaderData.availableProfessors.length > 0 ? (
                  <ul className="space-y-3">
                    {loaderData.availableProfessors.map((professor) => (
                      <li
                        key={professor.id}
                        className="rounded-md border border-slate-200 px-3 py-3"
                      >
                        <label className="flex items-start justify-between gap-4">
                          <span className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              name="professorIds"
                              value={professor.id}
                              defaultChecked={selectedProfessorIds.has(
                                professor.id,
                              )}
                              className="mt-0.5 size-4 rounded border-slate-300 text-teal-700 focus:ring-teal-100"
                            />
                            <span>
                              <span className="block text-sm font-medium text-slate-950">
                                {professor.lastName}, {professor.firstName}
                              </span>
                              <span className="block text-sm text-slate-600">
                                {professor.active
                                  ? "Disponible para nuevas asignaciones."
                                  : "Archivado pero conservado por vínculo existente."}
                              </span>
                            </span>
                          </span>
                          {!professor.active ? <ArchivedBadge /> : null}
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm leading-6 text-slate-600">
                    No hay Profesores activos o vinculados para editar en esta
                    Coreografía.
                  </p>
                )}

                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
                >
                  Guardar Profesores
                </button>
              </form>
            ) : (
              <ProfessorReadonlyList
                professors={loaderData.choreography.professors}
              />
            )}
          </div>
        </div>
      </section>

      <AccessSecondaryLink to={backToList} className="mt-8">
        Volver a Coreografías
      </AccessSecondaryLink>
    </PortalShell>
  );
}

export default function PortalCoreografiaDetalleRoute({
  loaderData,
}: PortalCoreografiaDetalleRouteProps) {
  const actionData = useActionData<typeof action>();
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

function ProfessorReadonlyList({
  professors,
}: {
  professors: PortalCoreografiaDetalleRouteProps["loaderData"]["choreography"]["professors"];
}) {
  if (professors.length === 0) {
    return (
      <p className="mt-4 text-sm leading-6 text-slate-600">
        Esta Coreografía todavía no tiene Profesores vinculados.
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
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
  operationalStatus: PortalCoreografiaDetalleRouteProps["loaderData"]["choreography"]["operationalStatus"];
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

function getReadOnlyBadgeClassName(isReadOnly: boolean) {
  return isReadOnly
    ? "inline-flex rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
    : "inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800";
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

function readUpdatedSuccessMessage(searchParams: URLSearchParams) {
  return searchParams.get(choreographyUpdatedSearchParam) === "1"
    ? choreographyUpdatedSuccessMessage
    : null;
}

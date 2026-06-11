import { Link } from "react-router";

import { AccessSecondaryLink } from "@/components/access-ui";
import { PortalShell } from "@/components/portal-ui";
import { requireAcademyUser } from "@/lib/internal-access.server";
import { getPortalEventContext } from "@/lib/portal-event-context.server";

const choreographyNotFoundMessage = "No encontramos esa Coreografía.";

type PortalCoreografiaDetalleRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
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

  return {
    email: user.email,
    academy,
    choreography,
    eventContext,
  };
}

export function PortalCoreografiaDetalleRouteView({
  loaderData,
}: PortalCoreografiaDetalleRouteProps) {
  const backToList =
    loaderData.eventContext.selectedEvent !== null
      ? `/portal/coreografias?${loaderData.eventContext.queryParamName}=${loaderData.eventContext.selectedEvent.id}`
      : "/portal/coreografias";

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

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
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
              value={
                loaderData.choreography.operationalStatus.code === "complete"
                  ? "Completa"
                  : `Pendiente: ${loaderData.choreography.operationalStatus.pendingItems
                      .map(formatOperationalPendingItemLabel)
                      .join(", ")}`
              }
            />
          </dl>
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
            <h3 className="text-sm font-semibold text-slate-950">Profesores</h3>
            {loaderData.choreography.professors.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {loaderData.choreography.professors.map((professor) => (
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
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Esta Coreografía todavía no tiene Profesores vinculados.
              </p>
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

export default PortalCoreografiaDetalleRouteView;

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

function formatGroupTypeLabel(
  groupType: PortalCoreografiaDetalleRouteProps["loaderData"]["choreography"]["groupType"],
) {
  switch (groupType) {
    case "solo":
      return "Solo";
    case "duo":
      return "Dúo";
    case "trio":
      return "Trío";
    case "grupal":
      return "Grupal";
  }
}

function formatOperationalPendingItemLabel(
  pendingItem: PortalCoreografiaDetalleRouteProps["loaderData"]["choreography"]["operationalStatus"]["pendingItems"][number],
) {
  switch (pendingItem) {
    case "music":
      return "Música";
    case "category":
      return "Categoría";
    case "experienceLevel":
      return "Nivel de experiencia";
    case "professors":
      return "Profesores";
  }
}
